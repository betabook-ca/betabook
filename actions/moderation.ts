"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  recordChangeRequestApproval,
  submitChangeRequest,
  applyAreaEdit,
  assertAreaDeletable,
  applyAreaDelete,
  assertAreaReparentable,
  applyAreaReparent,
  applyAreaMerge,
  assertClimbMovable,
  applyClimbMove,
  applyClimbEdit,
  assertClimbDeletable,
  applyClimbDelete,
  assertClimbMergeable,
  applyClimbMerge,
  assertClimbBreakable,
  applyClimbBreak,
  type MutationDecision,
} from "@/actions/moderation-apply";
import type { Database } from "@/db/client";
import { getDb } from "@/db/client";
import { getArea, getChangeRequest, getClimb, getUser, type ChangeRequest } from "@/db/queries";
import { moderationAuthorizedSql } from "@/db/queries/moderation";
import { changeRequests } from "@/db/schema";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import { composeClimbBreakTexts, validateClimbBreakInput } from "@/lib/broken-climbs";
import {
  validateClimbEditInput,
  validateClimbMergeOverrides,
  type RawClimbEditInput,
} from "@/lib/climbs";
import { sendChangeRequestDecisionEmail } from "@/lib/email";
import {
  changedFields,
  changeRequestCoverage,
  changeRequestScopeAreaIds,
  describeChangeRequest,
  isAdminForAllAreas,
  isAdminForAnyArea,
  isAdminForArea,
  type ChangeRequestDescription,
  type ChangeRequestPayload,
  type ChangeRequestType,
  type GatedActionResult,
} from "@/lib/moderation";
import { parseId } from "@/lib/parse-id";
import { isAdmin, requireAdmin, requireSession } from "@/lib/session";
import { pickFormFields, requireTrimmed } from "@/lib/validation";

import { afterCommit } from "./post-commit";

const CLIMB_EDIT_REQUEST_FIELDS = ["name", "type", "grade"] as const;
const CLIMB_BREAK_REQUEST_FIELDS = ["brokenOn", "reason"] as const;

function readClimbFormData(formData: FormData): RawClimbEditInput {
  return pickFormFields(formData, CLIMB_EDIT_REQUEST_FIELDS);
}

type Session = Awaited<ReturnType<typeof requireSession>>;

/** An admin's submission also records their approval. Other affected areas
 * still need coverage from their own admins. */
async function queueChangeRequest<T extends ChangeRequestType>(
  db: Database,
  session: Session,
  type: T,
  entityId: number,
  payload: ChangeRequestPayload[T],
): Promise<GatedActionResult> {
  const requestId = await submitChangeRequest(db, type, entityId, session.user.id, payload);
  if (isAdmin(session)) await recordChangeRequestApproval(db, requestId, session.user.id);
  return { status: "pending" };
}

export async function requestAreaEdit(
  areaId: number,
  formData: FormData,
): Promise<ActionResult<GatedActionResult>> {
  return toActionResult(async () => {
    const session = await requireSession();
    const db = await getDb();

    const existing = parseId(areaId) === null ? undefined : await getArea(db, areaId);
    if (!existing) throw new ActionError("Area not found");

    const name = requireTrimmed(formData.get("name"), "Name");
    const delta = changedFields(existing, { name });
    if (Object.keys(delta).length === 0) throw new ActionError("No changes to submit");

    if (await isAdminForArea(db, session, areaId)) {
      await applyAreaEdit(db, areaId, delta, {
        type: "area_edit",
        entityId: areaId,
        payload: delta,
        reviewerId: session.user.id,
      });
      return { status: "applied" };
    }
    return queueChangeRequest(db, session, "area_edit", areaId, delta);
  });
}

export async function requestAreaDelete(areaId: number): Promise<ActionResult<GatedActionResult>> {
  return toActionResult(async () => {
    const session = await requireSession();
    const db = await getDb();

    if (parseId(areaId) === null) throw new ActionError("Area not found");

    if (await isAdminForArea(db, session, areaId)) {
      await applyAreaDelete(db, areaId, {
        type: "area_delete",
        entityId: areaId,
        payload: {},
        reviewerId: session.user.id,
      });
      return { status: "applied" };
    }

    await assertAreaDeletable(db, areaId);
    return queueChangeRequest(db, session, "area_delete", areaId, {});
  });
}

export async function requestClimbEdit(
  climbId: number,
  formData: FormData,
): Promise<ActionResult<GatedActionResult>> {
  return toActionResult(async () => {
    const session = await requireSession();
    const db = await getDb();

    const existing = parseId(climbId) === null ? undefined : await getClimb(db, climbId);
    if (!existing) throw new ActionError("Climb not found");

    const input = validateClimbEditInput(existing, readClimbFormData(formData));
    const delta = changedFields(existing, input);
    if (delta.type !== undefined) delta.grade = input.grade;
    if (Object.keys(delta).length === 0) throw new ActionError("No changes to submit");

    const payload: ChangeRequestPayload["climb_edit"] = {
      ...delta,
      ...(delta.grade !== undefined || delta.type !== undefined
        ? { expectedType: existing.type }
        : {}),
    };
    if (await isAdminForArea(db, session, existing.areaId)) {
      await applyClimbEdit(db, climbId, payload, {
        type: "climb_edit",
        entityId: climbId,
        payload,
        reviewerId: session.user.id,
      });
      return { status: "applied" };
    }
    return queueChangeRequest(db, session, "climb_edit", climbId, payload);
  });
}

export async function requestClimbDelete(
  climbId: number,
): Promise<ActionResult<GatedActionResult>> {
  return toActionResult(async () => {
    const session = await requireSession();
    const db = await getDb();

    const existing = parseId(climbId) === null ? undefined : await getClimb(db, climbId);
    if (!existing) throw new ActionError("Climb not found");

    if (await isAdminForArea(db, session, existing.areaId)) {
      await applyClimbDelete(db, climbId, {
        type: "climb_delete",
        entityId: climbId,
        payload: {},
        reviewerId: session.user.id,
      });
      return { status: "applied" };
    }

    await assertClimbDeletable(db, climbId);
    return queueChangeRequest(db, session, "climb_delete", climbId, {});
  });
}

export async function requestAreaReparent(
  areaId: number,
  newParentId: number,
): Promise<ActionResult<GatedActionResult>> {
  return toActionResult(async () => {
    const session = await requireSession();
    const db = await getDb();

    if (parseId(areaId) === null) throw new ActionError("Area not found");
    if (parseId(newParentId) === null) throw new ActionError("Parent area not found");

    // Immediate application requires authority over both source and destination.
    if (await isAdminForAllAreas(db, session, [areaId, newParentId])) {
      await applyAreaReparent(db, areaId, newParentId, {
        type: "area_reparent",
        entityId: areaId,
        payload: { newParentId },
        reviewerId: session.user.id,
      });
      return { status: "applied" };
    }

    await assertAreaReparentable(db, areaId, newParentId);
    return queueChangeRequest(db, session, "area_reparent", areaId, { newParentId });
  });
}

export async function requestClimbMove(
  climbId: number,
  newAreaId: number,
): Promise<ActionResult<GatedActionResult>> {
  return toActionResult(async () => {
    const session = await requireSession();
    const db = await getDb();

    if (parseId(climbId) === null) throw new ActionError("Climb not found");
    if (parseId(newAreaId) === null) throw new ActionError("Area not found");

    const existing = await getClimb(db, climbId);
    if (existing && (await isAdminForAllAreas(db, session, [existing.areaId, newAreaId]))) {
      await applyClimbMove(db, climbId, newAreaId, {
        type: "climb_move",
        entityId: climbId,
        payload: { newAreaId },
        reviewerId: session.user.id,
      });
      return { status: "applied" };
    }

    await assertClimbMovable(db, climbId, newAreaId);
    return queueChangeRequest(db, session, "climb_move", climbId, { newAreaId });
  });
}

export async function requestClimbMerge(
  sourceClimbId: number,
  targetClimbId: number,
  overrides?: unknown,
): Promise<ActionResult<GatedActionResult>> {
  return toActionResult(async () => {
    const session = await requireSession();
    const db = await getDb();

    if (parseId(sourceClimbId) === null) throw new ActionError("Climb not found");
    if (parseId(targetClimbId) === null) throw new ActionError("Target climb not found");

    // A merge changes both climbs, so both areas must be covered.
    const { source, target } = await assertClimbMergeable(db, sourceClimbId, targetClimbId);
    const validated = validateClimbMergeOverrides(target, overrides);

    if (await isAdminForAllAreas(db, session, [source.areaId, target.areaId])) {
      await applyClimbMerge(db, sourceClimbId, targetClimbId, validated, {
        type: "climb_merge",
        entityId: sourceClimbId,
        payload: { targetClimbId, overrides: validated },
        reviewerId: session.user.id,
      });
      return { status: "applied" };
    }

    return queueChangeRequest(db, session, "climb_merge", sourceClimbId, {
      targetClimbId,
      overrides: validated,
    });
  });
}

/** Reports that a climb broke on a date. On approval the climb is marked
 * broken, its description gains a notice, and a post-break climb is created
 * with the same grade. The successor name and both descriptions are composed
 * here, from the climb as it is right now, and stored in the payload so the
 * reviewer approves the exact text (see lib/broken-climbs.ts). */
export async function requestClimbBreak(
  climbId: number,
  formData: FormData,
): Promise<ActionResult<GatedActionResult>> {
  return toActionResult(async () => {
    const session = await requireSession();
    const db = await getDb();

    if (parseId(climbId) === null) throw new ActionError("Climb not found");
    const input = validateClimbBreakInput(pickFormFields(formData, CLIMB_BREAK_REQUEST_FIELDS));
    const {
      climb: existing,
      laterSends,
      laterEntries,
    } = await assertClimbBreakable(db, climbId, input.brokenOn);
    const payload: ChangeRequestPayload["climb_break"] = {
      ...input,
      ...composeClimbBreakTexts(existing, input),
      laterSends,
      laterEntries,
    };

    if (await isAdminForArea(db, session, existing.areaId)) {
      await applyClimbBreak(db, climbId, payload, {
        type: "climb_break",
        entityId: climbId,
        payload,
        reviewerId: session.user.id,
      });
      return { status: "applied" };
    }
    return queueChangeRequest(db, session, "climb_break", climbId, payload);
  });
}

/** An awaiting decision records a vote but leaves the mutation pending. */
export type ReviewDecision = { decision: "applied" | "awaiting" };

/** Recheck status, ownership, and current scope at the action boundary;
 * the queue may be stale when the reviewer clicks. */
async function loadReviewableRequest(
  db: Database,
  session: Awaited<ReturnType<typeof requireAdmin>>,
  requestId: number,
): Promise<{ request: ChangeRequest; scopeAreaIds: number[] }> {
  if (parseId(requestId) === null) throw new ActionError("Request not found");
  const request = await getChangeRequest(db, requestId);
  if (!request) throw new ActionError("Request not found");
  if (request.status !== "pending") throw new ActionError("This request has already been reviewed");
  if (request.requestedBy === session.user.id) {
    throw new ActionError("You can't review your own request");
  }

  const scopeAreaIds = await changeRequestScopeAreaIds(db, request);
  if (scopeAreaIds.length === 0) {
    throw new ActionError("The area or climb this request affects is gone");
  }
  if (!(await isAdminForAnyArea(db, session, scopeAreaIds))) {
    throw new ActionError("You don't manage this area");
  }
  return { request, scopeAreaIds };
}

const CHANGE_REQUEST_APPLIERS: Record<
  ChangeRequestType,
  (db: Database, request: ChangeRequest, decision: MutationDecision) => Promise<void>
> = {
  area_edit: (db, request, decision) =>
    applyAreaEdit(db, request.entityId, JSON.parse(request.payload), decision),
  area_delete: (db, request, decision) => applyAreaDelete(db, request.entityId, decision),
  area_reparent: (db, request, decision) => {
    const { newParentId } = JSON.parse(request.payload);
    return applyAreaReparent(db, request.entityId, newParentId, decision);
  },
  area_merge: (db, request, decision) => {
    const { targetAreaId } = JSON.parse(request.payload);
    return applyAreaMerge(db, request.entityId, targetAreaId, decision);
  },
  climb_edit: (db, request, decision) =>
    applyClimbEdit(db, request.entityId, JSON.parse(request.payload), decision),
  climb_delete: (db, request, decision) => applyClimbDelete(db, request.entityId, decision),
  climb_move: (db, request, decision) => {
    const { newAreaId } = JSON.parse(request.payload);
    return applyClimbMove(db, request.entityId, newAreaId, decision);
  },
  climb_merge: (db, request, decision) => {
    const { targetClimbId, overrides } = JSON.parse(request.payload);
    return applyClimbMerge(db, request.entityId, targetClimbId, overrides, decision);
  },
  climb_break: (db, request, decision) =>
    applyClimbBreak(db, request.entityId, JSON.parse(request.payload), decision),
};

/** Reject only a still-pending request; concurrent decisions must not be overwritten. */
async function claimDecision(
  db: Database,
  request: ChangeRequest,
  reviewerId: string,
  note: string | null,
): Promise<boolean> {
  const claimed = await db
    .update(changeRequests)
    .set({
      status: "rejected",
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNote: note,
    })
    .where(
      and(
        eq(changeRequests.id, request.id),
        eq(changeRequests.status, "pending"),
        eq(changeRequests.payload, request.payload),
        moderationAuthorizedSql(reviewerId, request, { requireAll: false }),
      ),
    )
    .returning({ id: changeRequests.id });
  return claimed.length > 0;
}

/** Notification failures must not turn a committed decision into an action error. */
async function notifyRequester(
  db: Database,
  request: ChangeRequest,
  reviewerId: string,
  decision: "approved" | "rejected",
  description: ChangeRequestDescription,
  note: string | null,
) {
  if (!request.requestedBy || request.requestedBy === reviewerId) return;
  try {
    const requester = await getUser(db, request.requestedBy);
    if (!requester) return;
    await sendChangeRequestDecisionEmail(requester.email, {
      name: requester.name,
      summary: description.requesterSummary,
      details: description.details,
      decision,
      note,
      href: description.href,
    });
  } catch (err) {
    console.error("change request decision email failed", err);
  }
}

export async function approveChangeRequest(
  requestId: number,
): Promise<ActionResult<ReviewDecision>> {
  return toActionResult(async () => {
    const session = await requireAdmin();
    const db = await getDb();

    const { request, scopeAreaIds } = await loadReviewableRequest(db, session, requestId);
    await recordChangeRequestApproval(db, requestId, session.user.id);

    const coverage = await changeRequestCoverage(db, request, scopeAreaIds);
    if (!coverage.complete) {
      // Notify the requester only after a final decision.
      afterCommit(() => revalidatePath("/admin/requests"));
      return { decision: "awaiting" };
    }

    // Capture the before/after description before the mutation overwrites the old values.
    const description = await describeChangeRequest(db, request);

    await CHANGE_REQUEST_APPLIERS[request.type](db, request, {
      request,
      reviewerId: session.user.id,
    });

    afterCommit(() => revalidatePath("/admin/requests"));
    await notifyRequester(db, request, session.user.id, "approved", description, null);
    return { decision: "applied" };
  });
}

export async function rejectChangeRequest(requestId: number, note: unknown): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireAdmin();
    const db = await getDb();

    const { request } = await loadReviewableRequest(db, session, requestId);
    const trimmedNote = typeof note === "string" ? note.trim().slice(0, 2000) || null : null;
    const description = await describeChangeRequest(db, request);

    if (!(await claimDecision(db, request, session.user.id, trimmedNote))) {
      throw new ActionError("This request has already been reviewed");
    }
    afterCommit(() => revalidatePath("/admin/requests"));
    await notifyRequester(db, request, session.user.id, "rejected", description, trimmedNote);
  });
}
