import { and, eq, exists, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { alias } from "drizzle-orm/sqlite-core";
import { refresh, revalidatePath } from "next/cache";

import type { Database } from "@/db/client";
import {
  getArea,
  getClimb,
  getSubareas,
  hasClimbsInArea,
  type Area,
  type ChangeRequest,
  type Climb,
} from "@/db/queries";
import {
  areas,
  changeRequestApprovals,
  changeRequests,
  climbs,
  journalEntries,
  sends,
} from "@/db/schema";
import { ActionError } from "@/lib/action-result";
import type { AreaInput } from "@/lib/areas";
import { validateClimbMergeOverrides, validateClimbEditInput } from "@/lib/climbs";
import type { ChangeRequestPayload, ChangeRequestType } from "@/lib/moderation";

import { afterCommit } from "./post-commit";

const ORPHANED_REVIEW_NOTE = "The area or climb this request affected no longer exists.";

export type MutationDecision = { reviewerId: string } & (
  | { request: ChangeRequest }
  | { type: ChangeRequestType; entityId: number; payload: object }
);

function areaUnchanged(area: Area): SQL {
  return sql`EXISTS (SELECT 1 FROM areas WHERE id = ${area.id} AND parent_id IS ${area.parentId})`;
}

function climbUnchanged(climb: Climb): SQL {
  return sql`EXISTS (SELECT 1 FROM climbs WHERE id = ${climb.id}
    AND type = ${climb.type} AND area_id = ${climb.areaId})`;
}

/** The NOT NULL guard aborts the entire batch if a concurrent decision or
 * entity change invalidated the reads used to prepare this mutation. */
async function commitMutation(
  db: Database,
  statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
  guard: SQL,
  decision?: MutationDecision,
) {
  const audit: BatchItem<"sqlite">[] = [];
  if (decision && "request" in decision) {
    const request = decision.request;
    audit.push(
      db
        .insert(changeRequestApprovals)
        .values({
          requestId: sql`(SELECT id FROM change_requests
          WHERE id = ${request.id} AND status = 'pending' AND payload = ${request.payload} AND ${guard})`,
          userId: decision.reviewerId,
        })
        .onConflictDoNothing(),
      db
        .update(changeRequests)
        .set({
          status: "approved",
          reviewedBy: decision.reviewerId,
          reviewedAt: new Date(),
          reviewNote: null,
        })
        .where(eq(changeRequests.id, request.id)),
    );
  } else if (decision) {
    audit.push(
      db.insert(changeRequests).values({
        type: decision.type,
        entityId: decision.entityId,
        payload: sql`CASE WHEN ${guard} THEN ${JSON.stringify(decision.payload)} ELSE NULL END`,
        requestedBy: decision.reviewerId,
        status: "approved",
        reviewedBy: decision.reviewerId,
        reviewedAt: new Date(),
      }),
      db
        .insert(changeRequestApprovals)
        .values({ requestId: sql`last_insert_rowid()`, userId: decision.reviewerId }),
    );
  }
  try {
    await db.batch([...audit, ...statements] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  } catch (error) {
    for (let cause = error; cause instanceof Error; cause = cause.cause) {
      if (
        cause.message.includes("NOT NULL constraint failed: change_request_approvals.request_id") ||
        cause.message.includes("NOT NULL constraint failed: change_requests.payload")
      ) {
        throw new ActionError("The request or affected area/climb changed — reload and try again");
      }
    }
    throw error;
  }
}

function rejectOrphanedClimbRequests(db: Database, climbId: number) {
  return db
    .update(changeRequests)
    .set({ status: "rejected", reviewNote: ORPHANED_REVIEW_NOTE, reviewedAt: new Date() })
    .where(
      and(
        eq(changeRequests.status, "pending"),
        or(
          and(
            inArray(changeRequests.type, [
              "climb_edit",
              "climb_delete",
              "climb_move",
              "climb_merge",
            ]),
            eq(changeRequests.entityId, climbId),
          ),
          and(
            eq(changeRequests.type, "climb_merge"),
            sql`json_extract(${changeRequests.payload}, '$.targetClimbId') = ${climbId}`,
          ),
        ),
      ),
    );
}

function rejectOrphanedAreaRequests(db: Database, areaId: number) {
  return db
    .update(changeRequests)
    .set({ status: "rejected", reviewNote: ORPHANED_REVIEW_NOTE, reviewedAt: new Date() })
    .where(
      and(
        eq(changeRequests.status, "pending"),
        or(
          and(
            inArray(changeRequests.type, ["area_edit", "area_delete", "area_reparent"]),
            eq(changeRequests.entityId, areaId),
          ),
          and(
            eq(changeRequests.type, "area_reparent"),
            sql`json_extract(${changeRequests.payload}, '$.newParentId') = ${areaId}`,
          ),
          and(
            eq(changeRequests.type, "climb_move"),
            sql`json_extract(${changeRequests.payload}, '$.newAreaId') = ${areaId}`,
          ),
        ),
      ),
    );
}

export async function applyAreaEdit(
  db: Database,
  areaId: number,
  input: Partial<Pick<AreaInput, "name">>,
  decision?: MutationDecision,
): Promise<void> {
  const existing = await getArea(db, areaId);
  if (!existing) throw new ActionError("Area not found");
  if (Object.keys(input).length === 0) throw new ActionError("No changes to apply");

  await commitMutation(
    db,
    [db.update(areas).set(input).where(eq(areas.id, areaId))],
    areaUnchanged(existing),
    decision,
  );

  afterCommit(() => {
    revalidatePath(`/areas/${areaId}`);
    if (existing.parentId != null) revalidatePath(`/areas/${existing.parentId}`);
    revalidatePath("/");
    refresh();
  });
}

export async function assertAreaDeletable(db: Database, areaId: number): Promise<Area> {
  const existing = await getArea(db, areaId);
  if (!existing) throw new ActionError("Area not found");
  const subareas = await getSubareas(db, areaId);
  if (subareas.length > 0) throw new ActionError("Can't delete an area with sub-areas");
  if (await hasClimbsInArea(db, areaId)) throw new ActionError("Can't delete an area with climbs");
  return existing;
}

export async function applyAreaDelete(
  db: Database,
  areaId: number,
  decision?: MutationDecision,
): Promise<void> {
  const existing = await assertAreaDeletable(db, areaId);

  await commitMutation(
    db,
    [db.delete(areas).where(eq(areas.id, areaId)), rejectOrphanedAreaRequests(db, areaId)],
    areaUnchanged(existing),
    decision,
  );

  afterCommit(() => {
    revalidatePath(`/areas/${areaId}`);
    if (existing.parentId != null) revalidatePath(`/areas/${existing.parentId}`);
    revalidatePath("/");
    refresh();
  });
}

async function isAreaOrDescendant(
  db: Database,
  candidateId: number,
  ofId: number,
): Promise<boolean> {
  if (candidateId === ofId) return true;
  const [row] = await db.all<{ found: number }>(sql`
    WITH RECURSIVE chain(id) AS (
      SELECT parent_id FROM areas WHERE id = ${candidateId}
      UNION ALL
      SELECT areas.parent_id FROM chain JOIN areas ON areas.id = chain.id
      WHERE areas.parent_id IS NOT NULL
    )
    SELECT 1 AS found FROM chain WHERE id = ${ofId} LIMIT 1
  `);
  return Boolean(row);
}

export async function assertAreaReparentable(
  db: Database,
  areaId: number,
  newParentId: number,
): Promise<Area> {
  const existing = await getArea(db, areaId);
  if (!existing) throw new ActionError("Area not found");
  if (!(await getArea(db, newParentId))) throw new ActionError("Parent area not found");
  if (await isAreaOrDescendant(db, newParentId, areaId)) {
    throw new ActionError("Can't move an area under itself or one of its own sub-areas");
  }
  return existing;
}

export async function applyAreaReparent(
  db: Database,
  areaId: number,
  newParentId: number,
  decision?: MutationDecision,
): Promise<void> {
  const existing = await assertAreaReparentable(db, areaId, newParentId);

  await commitMutation(
    db,
    [db.update(areas).set({ parentId: newParentId }).where(eq(areas.id, areaId))],
    areaUnchanged(existing),
    decision,
  );

  afterCommit(() => {
    revalidatePath(`/areas/${areaId}`);
    revalidatePath(`/areas/${newParentId}`);
    if (existing.parentId != null) revalidatePath(`/areas/${existing.parentId}`);
    revalidatePath("/");
    refresh();
  });
}

export async function assertClimbMovable(
  db: Database,
  climbId: number,
  newAreaId: number,
): Promise<Climb> {
  const existing = await getClimb(db, climbId);
  if (!existing) throw new ActionError("Climb not found");
  if (!(await getArea(db, newAreaId))) throw new ActionError("Area not found");
  return existing;
}

export async function applyClimbMove(
  db: Database,
  climbId: number,
  newAreaId: number,
  decision?: MutationDecision,
): Promise<void> {
  const existing = await assertClimbMovable(db, climbId, newAreaId);

  await commitMutation(
    db,
    [db.update(climbs).set({ areaId: newAreaId }).where(eq(climbs.id, climbId))],
    climbUnchanged(existing),
    decision,
  );

  afterCommit(() => {
    revalidatePath(`/climbs/${climbId}`);
    revalidatePath(`/areas/${newAreaId}`);
    revalidatePath(`/areas/${existing.areaId}`);
    revalidatePath("/");
    refresh();
  });
}

export async function applyClimbEdit(
  db: Database,
  climbId: number,
  input: ChangeRequestPayload["climb_edit"],
  decision?: MutationDecision,
): Promise<void> {
  const existing = await getClimb(db, climbId);
  if (!existing) throw new ActionError("Climb not found");
  if (Object.keys(input).length === 0) throw new ActionError("No changes to apply");

  if (
    decision &&
    "request" in decision &&
    (input.grade !== undefined || input.type !== undefined) &&
    !input.expectedType
  ) {
    throw new ActionError(
      "This grade request has no discipline context — reject it and request a new submission",
    );
  }
  if (input.expectedType !== undefined && existing.type !== input.expectedType) {
    throw new ActionError("The discipline changed — reload and submit a new edit");
  }
  const validated = validateClimbEditInput(existing, {
    name: input.name ?? existing.name,
    type: input.type ?? existing.type,
    grade: String(input.grade ?? existing.grade ?? 0),
  });
  const values = {
    ...(input.name !== undefined ? { name: validated.name } : {}),
    ...(input.type !== undefined ? { type: validated.type } : {}),
    ...(input.grade !== undefined ? { grade: validated.grade } : {}),
  };
  await commitMutation(
    db,
    [
      db
        .update(climbs)
        .set({
          ...values,
          type: sql`CASE WHEN ${climbUnchanged(existing)} THEN ${validated.type} ELSE NULL END`,
        })
        .where(eq(climbs.id, climbId)),
    ],
    climbUnchanged(existing),
    decision,
  );

  afterCommit(() => {
    revalidatePath(`/climbs/${climbId}`);
    revalidatePath(`/areas/${existing.areaId}`);
    revalidatePath("/");
    refresh();
  });
}

export async function assertClimbDeletable(db: Database, climbId: number): Promise<Climb> {
  const existing = await getClimb(db, climbId);
  if (!existing) throw new ActionError("Climb not found");
  if (existing.sendCount > 0) throw new ActionError("Can't delete a climb with logged sends");
  if (await hasJournalEntriesForClimb(db, climbId)) {
    throw new ActionError("Can't delete a climb with journal entries");
  }
  return existing;
}

async function hasJournalEntriesForClimb(db: Database, climbId: number): Promise<boolean> {
  const row = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(eq(journalEntries.climbId, climbId))
    .limit(1)
    .get();
  return row != null;
}

export async function applyClimbDelete(
  db: Database,
  climbId: number,
  decision?: MutationDecision,
): Promise<void> {
  const existing = await assertClimbDeletable(db, climbId);
  await commitMutation(
    db,
    [db.delete(climbs).where(eq(climbs.id, climbId)), rejectOrphanedClimbRequests(db, climbId)],
    climbUnchanged(existing),
    decision,
  );

  afterCommit(() => {
    revalidatePath(`/areas/${existing.areaId}`);
    revalidatePath("/");
    refresh();
  });
}

export async function assertClimbMergeable(
  db: Database,
  sourceClimbId: number,
  targetClimbId: number,
): Promise<{ source: Climb; target: Climb }> {
  if (sourceClimbId === targetClimbId) {
    throw new ActionError("Can't mark a climb as a duplicate of itself");
  }
  const source = await getClimb(db, sourceClimbId);
  if (!source) throw new ActionError("Climb not found");
  const target = await getClimb(db, targetClimbId);
  if (!target) throw new ActionError("Target climb not found");
  if (source.type !== target.type) {
    throw new ActionError("Can't mark a climb as a duplicate of a different discipline");
  }
  return { source, target };
}

export async function applyClimbMerge(
  db: Database,
  sourceClimbId: number,
  targetClimbId: number,
  rawOverrides?: unknown,
  decision?: MutationDecision,
): Promise<void> {
  const { source, target } = await assertClimbMergeable(db, sourceClimbId, targetClimbId);
  const overrides = validateClimbMergeOverrides(target, rawOverrides);

  // Batch items must be query builders; db.run(sql`...`) lacks the prepared
  // statement shape expected by the Drizzle D1 batch driver.
  const collidingTarget = alias(sends, "t");

  const collidesWithTarget = exists(
    db
      .select({ one: sql`1` })
      .from(collidingTarget)
      .where(
        and(eq(collidingTarget.climbId, targetClimbId), eq(collidingTarget.userId, sends.userId)),
      ),
  );

  const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
    // Preserve colliding undated comments as notes dated to the merge.
    // insert().select() requires all columns in schema order; NULL ID permits autoincrement.
    db.insert(journalEntries).select(
      db
        .select({
          id: sql<number>`null`.as("id"),
          userId: sends.userId,
          climbId: sql<number>`${targetClimbId}`.as("climb_id"),
          kind: sql<string>`'session'`.as("kind"),
          sent: sql<boolean>`0`.as("sent"),
          isAscent: sql<boolean>`0`.as("is_ascent"),
          isSendComment: sql<boolean>`1`.as("is_send_comment"),
          entryDate: sql<string>`date('now')`.as("entry_date"),
          body: sends.comment,
          tags: sql<string | null>`null`.as("tags"),
          createdAt: sql<number>`(cast(unixepoch('subsecond') * 1000 as integer))`.as("created_at"),
          updatedAt: sql<number>`(cast(unixepoch('subsecond') * 1000 as integer))`.as("updated_at"),
        })
        .from(sends)
        .where(
          and(
            eq(sends.climbId, sourceClimbId),
            isNull(sends.dateSent),
            isNotNull(sends.comment),
            collidesWithTarget,
          ),
        ),
    ),
    // Delete collisions first; the send trigger demotes their ascent entries.
    db.delete(sends).where(and(eq(sends.climbId, sourceClimbId), collidesWithTarget)),
    db.update(sends).set({ climbId: targetClimbId }).where(eq(sends.climbId, sourceClimbId)),
    // Keep every entry ID, including ascents, so companion tags and suppression
    // remain attached. SQL permits ascent moves only after their matching send.
    db
      .update(journalEntries)
      .set({ climbId: targetClimbId })
      .where(eq(journalEntries.climbId, sourceClimbId)),
    ...(Object.keys(overrides).length > 0
      ? [db.update(climbs).set(overrides).where(eq(climbs.id, targetClimbId))]
      : []),
    db.delete(climbs).where(eq(climbs.id, sourceClimbId)),
    // The current request is already approved; reject the remaining orphaned requests.
    rejectOrphanedClimbRequests(db, sourceClimbId),
  ];
  await commitMutation(
    db,
    statements,
    sql`${climbUnchanged(source)} AND ${climbUnchanged(target)}`,
    decision,
  );

  afterCommit(() => {
    revalidatePath(`/climbs/${targetClimbId}`);
    revalidatePath(`/climbs/${sourceClimbId}`);
    revalidatePath(`/areas/${target.areaId}`);
    if (source.areaId !== target.areaId) revalidatePath(`/areas/${source.areaId}`);
    revalidatePath("/");
    refresh();
  });
}

/** Drizzle wraps SQLite constraint errors in the cause chain. */
function isUniqueConstraintError(err: unknown): boolean {
  let current = err;
  while (current instanceof Error) {
    if (current.message.includes("UNIQUE constraint failed")) return true;
    current = current.cause;
  }
  return false;
}

/** The partial unique index permits one pending request per type/entity/requester. */
export async function submitChangeRequest<T extends ChangeRequestType>(
  db: Database,
  type: T,
  entityId: number,
  requestedBy: string,
  payload: ChangeRequestPayload[T],
): Promise<number> {
  try {
    const [{ id }] = await db
      .insert(changeRequests)
      .values({ type, entityId, requestedBy, payload: JSON.stringify(payload) })
      .returning({ id: changeRequests.id });
    return id;
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new ActionError(
        "You already have a pending request for this — an admin will review it",
      );
    }
    throw err;
  }
}

/** Votes are idempotent. Recording a vote does not itself apply the request. */
export async function recordChangeRequestApproval(
  db: Database,
  requestId: number,
  userId: string,
): Promise<void> {
  await db.insert(changeRequestApprovals).values({ requestId, userId }).onConflictDoNothing();
}
