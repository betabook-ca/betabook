import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  getArea,
  getClimb,
  getApprovalCoverageRows,
  getModerationFacts,
  getScopedPendingRequests,
  type ModerationFacts,
  type RequestScope,
  type ReviewQueueOptions,
  type ChangeRequest,
  type Climb,
} from "@/db/queries";
import { CHANGE_REQUEST_TYPES } from "@/db/schema";
import type { AreaInput } from "@/lib/areas";
import type { ClimbBreakInput, ClimbBreakTexts } from "@/lib/broken-climbs";
import type { ClimbEditInput, ClimbMergeOverrides } from "@/lib/climbs";
import { formatGrade } from "@/lib/grades";
import { isAdmin } from "@/lib/session";
import { areaHref, climbHref } from "@/lib/slug";

export type ChangeRequestType = (typeof CHANGE_REQUEST_TYPES)[number];

export type GatedActionResult = { status: "applied" | "pending" };

/** Requested fields plus the context needed to interpret discipline-specific
 * grades. Application validates the result against the current entity. */
export type ChangeRequestPayload = {
  // Descriptions are edited directly and do not require moderation.
  area_edit: Partial<Pick<AreaInput, "name">>;
  area_delete: Record<string, never>;
  area_reparent: { newParentId: number };
  climb_edit: Partial<ClimbEditInput> & { expectedType?: Climb["type"] };
  climb_delete: Record<string, never>;
  climb_move: { newAreaId: number };
  // Merge targets retain their area and discipline.
  climb_merge: { targetClimbId: number; overrides?: ClimbMergeOverrides };
  // The texts are composed at request time and written verbatim on approval,
  // so the queue shows exactly what will land (see lib/broken-climbs.ts).
  climb_break: ClimbBreakInput & ClimbBreakTexts;
};

export function changedFields<T extends Record<string, unknown>>(
  existing: Record<string, unknown>,
  input: T,
): Partial<T> {
  const delta: Partial<T> = {};
  for (const key of Object.keys(input) as (keyof T)[]) {
    if (input[key] !== existing[key as string]) delta[key] = input[key];
  }
  return delta;
}

/** An admin grant covers its area and descendants. The role alone grants no scope. */
export async function isAdminForArea(
  db: Database,
  session: { user: { id: string; role?: string | null } },
  areaId: number,
): Promise<boolean> {
  if (!isAdmin(session)) return false;

  const [row] = await db.all<{ found: number }>(sql`
    WITH RECURSIVE chain(id) AS (
      SELECT ${areaId}
      UNION ALL
      SELECT areas.parent_id FROM chain JOIN areas ON areas.id = chain.id
      WHERE areas.parent_id IS NOT NULL
    )
    SELECT 1 AS found FROM admin_area_scopes
    WHERE user_id = ${session.user.id} AND area_id IN (SELECT id FROM chain)
    LIMIT 1
  `);
  return Boolean(row);
}

/** Use current source/destination areas, including both sides of moves and merges.
 * An empty scope means a required entity is gone and approval is unavailable. */
export async function changeRequestScopeAreaIds(
  db: Database,
  request: ChangeRequest,
): Promise<number[]> {
  if (request.type === "area_reparent") {
    const area = await getArea(db, request.entityId);
    if (!area) return [];
    const { newParentId } = JSON.parse(request.payload) as ChangeRequestPayload["area_reparent"];
    if (!(await getArea(db, newParentId))) return [];
    return area.id === newParentId ? [area.id] : [area.id, newParentId];
  }
  if (request.type === "climb_move") {
    const climb = await getClimb(db, request.entityId);
    if (!climb) return [];
    const { newAreaId } = JSON.parse(request.payload) as ChangeRequestPayload["climb_move"];
    if (!(await getArea(db, newAreaId))) return [];
    return climb.areaId === newAreaId ? [climb.areaId] : [climb.areaId, newAreaId];
  }
  if (request.type === "climb_merge") {
    const source = await getClimb(db, request.entityId);
    if (!source) return [];
    const { targetClimbId } = JSON.parse(request.payload) as ChangeRequestPayload["climb_merge"];
    const target = await getClimb(db, targetClimbId);
    if (!target) return [];
    return source.areaId === target.areaId ? [source.areaId] : [source.areaId, target.areaId];
  }
  if (request.type.startsWith("area_")) {
    const area = await getArea(db, request.entityId);
    return area ? [area.id] : [];
  }
  const climb = await getClimb(db, request.entityId);
  return climb ? [climb.areaId] : [];
}

/** Any covered area permits viewing and voting; applying requires full coverage. */
export async function isAdminForAnyArea(
  db: Database,
  session: { user: { id: string; role?: string | null } },
  areaIds: number[],
): Promise<boolean> {
  for (const areaId of areaIds) {
    if (await isAdminForArea(db, session, areaId)) return true;
  }
  return false;
}

/** Immediate application requires authority over every affected area. */
export async function isAdminForAllAreas(
  db: Database,
  session: { user: { id: string; role?: string | null } },
  areaIds: number[],
): Promise<boolean> {
  if (areaIds.length === 0) return false;
  for (const areaId of areaIds) {
    if (!(await isAdminForArea(db, session, areaId))) return false;
  }
  return true;
}

export type ChangeRequestCoverage = {
  scopeAreaIds: number[];
  approvers: { id: string; name: string }[];
  /** Areas without a current authorized approval. Empty scope is still incomplete. */
  missingAreaIds: number[];
  complete: boolean;
};

/** Recompute coverage using current roles, grants, and entity locations so
 * revoked permissions and moves invalidate old coverage. Empty scope is incomplete. */
export async function changeRequestCoverage(
  db: Database,
  request: ChangeRequest,
  scopeAreaIds: number[],
): Promise<ChangeRequestCoverage> {
  const coverage = await batchCoverage(db, [{ request, scopeAreaIds }]);
  return (
    coverage.get(request.id) ?? {
      scopeAreaIds,
      approvers: [],
      missingAreaIds: scopeAreaIds,
      complete: false,
    }
  );
}

export type ChangeRequestDescription = {
  summary: string;
  /** Requester wording; merges are described as marking a duplicate. */
  requesterSummary: string;
  href: string | null;
  /** Field changes relative to the entity's current state. */
  details: string[];
};

function climbMergeDetails(
  source: Climb | undefined,
  target: Climb | undefined,
  overrides: ClimbMergeOverrides | undefined,
): string[] {
  const details: string[] = [];
  if (source && target) {
    details.push(`${source.sendCount} send(s) move to "${target.name}"`);
  }
  if (overrides?.name !== undefined) {
    details.push(`Name: "${target?.name ?? "?"}" → "${overrides.name}"`);
  }
  if (overrides?.grade !== undefined && target) {
    details.push(
      `Grade: ${formatGrade(target.type, target.grade)} → ${formatGrade(target.type, overrides.grade)}`,
    );
  }
  if (overrides?.description !== undefined) {
    details.push(
      `Description: ${excerpt(target?.description)} → ${excerpt(overrides.description)}`,
    );
  }
  return details;
}

function excerpt(value: string | null | undefined): string {
  if (value == null || value === "") return "(empty)";
  return value.length > 80 ? `${value.slice(0, 80)}…` : value;
}

const CHANGE_REQUEST_DESCRIBERS: Record<
  ChangeRequestType,
  (
    facts: ModerationFacts,
    request: ChangeRequest,
  ) => Omit<ChangeRequestDescription, "requesterSummary"> & { requesterSummary?: string }
> = {
  area_edit: (facts, request) => {
    const area = facts.areas.get(request.entityId);
    const payload = JSON.parse(request.payload) as ChangeRequestPayload["area_edit"];
    const details: string[] = [];
    if (payload.name !== undefined) {
      details.push(`Name: "${area?.name ?? "?"}" → "${payload.name}"`);
    }
    return {
      summary:
        payload.name !== undefined
          ? `Rename "${area?.name ?? "an area"}" to "${payload.name}"`
          : `Edit "${area?.name ?? "an area"}"`,
      href: area ? areaHref(area.id, area.name) : null,
      details,
    };
  },
  area_delete: (facts, request) => {
    const area = facts.areas.get(request.entityId);
    return {
      summary: `Delete "${area?.name ?? "an area"}"`,
      href: area ? areaHref(area.id, area.name) : null,
      details: [],
    };
  },
  area_reparent: (facts, request) => {
    const { newParentId } = JSON.parse(request.payload) as ChangeRequestPayload["area_reparent"];
    const [area, newParent] = [facts.areas.get(request.entityId), facts.areas.get(newParentId)];
    const currentParent = area?.parentId != null ? facts.areas.get(area.parentId) : undefined;
    return {
      summary: `Move "${area?.name ?? "an area"}" under "${newParent?.name ?? "another area"}"`,
      href: area ? areaHref(area.id, area.name) : null,
      details: [`Parent: "${currentParent?.name ?? "(top level)"}" → "${newParent?.name ?? "?"}"`],
    };
  },
  climb_edit: (facts, request) => {
    const climb = facts.climbs.get(request.entityId);
    const payload = JSON.parse(request.payload) as ChangeRequestPayload["climb_edit"];
    const details: string[] = [];
    if (payload.name !== undefined) {
      details.push(`Name: "${climb?.name ?? "?"}" → "${payload.name}"`);
    }
    if (payload.type !== undefined && climb) {
      details.push(`Discipline: ${climb.type} → ${payload.type}`);
    }
    if (payload.grade !== undefined && climb) {
      const newType = payload.type ?? climb.type;
      details.push(
        `Grade: ${formatGrade(climb.type, climb.grade)} → ${formatGrade(newType, payload.grade)}`,
      );
    }
    return {
      summary:
        payload.name !== undefined
          ? `Rename "${climb?.name ?? "a climb"}" to "${payload.name}"`
          : `Edit "${climb?.name ?? "a climb"}"`,
      href: climb ? climbHref(climb.id, climb.name) : null,
      details,
    };
  },
  climb_delete: (facts, request) => {
    const climb = facts.climbs.get(request.entityId);
    return {
      summary: `Delete "${climb?.name ?? "a climb"}"`,
      href: climb ? climbHref(climb.id, climb.name) : null,
      details: [],
    };
  },
  climb_move: (facts, request) => {
    const { newAreaId } = JSON.parse(request.payload) as ChangeRequestPayload["climb_move"];
    const [climb, newArea] = [facts.climbs.get(request.entityId), facts.areas.get(newAreaId)];
    const currentArea = climb ? facts.areas.get(climb.areaId) : undefined;
    return {
      summary: `Move "${climb?.name ?? "a climb"}" to "${newArea?.name ?? "another area"}"`,
      href: climb ? climbHref(climb.id, climb.name) : null,
      details: [`Area: "${currentArea?.name ?? "?"}" → "${newArea?.name ?? "?"}"`],
    };
  },
  climb_merge: (facts, request) => {
    const { targetClimbId, overrides } = JSON.parse(
      request.payload,
    ) as ChangeRequestPayload["climb_merge"];
    const [source, target] = [facts.climbs.get(request.entityId), facts.climbs.get(targetClimbId)];
    const sourceName = source?.name ?? "a climb";
    const targetName = target?.name ?? "another climb";
    return {
      summary: `Merge "${sourceName}" into "${targetName}"`,
      requesterSummary: `Mark "${sourceName}" as a duplicate of "${targetName}"`,
      href: source ? climbHref(source.id, source.name) : null,
      details: climbMergeDetails(source, target, overrides),
    };
  },
  climb_break: (facts, request) => {
    const climb = facts.climbs.get(request.entityId);
    const payload = JSON.parse(request.payload) as ChangeRequestPayload["climb_break"];
    const name = climb?.name ?? "a climb";
    return {
      summary: `Mark "${name}" as broken on ${payload.brokenOn}`,
      requesterSummary: `Report "${name}" as broken on ${payload.brokenOn}`,
      href: climb ? climbHref(climb.id, climb.name) : null,
      details: [
        `Broke on: ${payload.brokenOn}`,
        `Reason: ${payload.reason}`,
        `New climb: "${payload.successorName}"${
          climb ? ` at ${formatGrade(climb.type, climb.grade)}` : ""
        }`,
        `Description of "${name}" becomes: ${payload.appendedDescription}`,
        `Description of the new climb: ${payload.successorDescription}`,
      ],
    };
  },
};

export async function describeChangeRequest(
  db: Database,
  request: ChangeRequest,
): Promise<ChangeRequestDescription> {
  return describeFromFacts(await getModerationFacts(db, [request]), request);
}

function describeFromFacts(
  facts: ModerationFacts,
  request: ChangeRequest,
): ChangeRequestDescription {
  const described = CHANGE_REQUEST_DESCRIBERS[request.type](facts, request);
  return { requesterSummary: described.summary, ...described };
}

async function batchCoverage(db: Database, requests: RequestScope[]) {
  const rows = await getApprovalCoverageRows(db, requests);
  const coverage = new Map<number, ChangeRequestCoverage>();
  for (const { request, scopeAreaIds } of requests) {
    const approvals = rows.filter((row) => row.requestId === request.id);
    const approvers = new Map(
      approvals.map((row) => [row.userId, { id: row.userId, name: row.name }]),
    );
    const covered = new Set(approvals.filter((row) => row.covered === 1).map((row) => row.areaId));
    const missingAreaIds = scopeAreaIds.filter((id) => !covered.has(id));
    coverage.set(request.id, {
      scopeAreaIds,
      approvers: [...approvers.values()],
      missingAreaIds,
      complete: scopeAreaIds.length > 0 && missingAreaIds.length === 0,
    });
  }
  return coverage;
}

export async function getReviewQueueDetails(
  db: Database,
  session: { user: { id: string; role?: string | null } },
  options: ReviewQueueOptions = {},
) {
  if (!isAdmin(session)) return [];
  const queue = await getScopedPendingRequests(db, session.user.id, options);
  const [facts, coverage] = await Promise.all([
    getModerationFacts(
      db,
      queue.map(({ request }) => request),
    ),
    batchCoverage(db, queue),
  ]);
  return queue.map(({ request, scopeAreaIds }) => ({
    request,
    description: describeFromFacts(facts, request),
    coverage: coverage.get(request.id) ?? {
      scopeAreaIds,
      approvers: [],
      missingAreaIds: scopeAreaIds,
      complete: false,
    },
  }));
}
