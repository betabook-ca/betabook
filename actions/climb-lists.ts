"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";

import { getDb, type Database } from "@/db/client";
import { climbListLinkCoversSql } from "@/db/queries/climb-list-shares";
import { climbListsVisibleSql } from "@/db/queries/content-access";
import { climbListItems, climbLists } from "@/db/schema";
import {
  ActionError,
  JOURNAL_RATE_LIMIT_MESSAGE,
  errorChainIncludes,
  toActionResult,
  type ActionResult,
} from "@/lib/action-result";
import {
  CLIMB_LIST_CHANGED_MESSAGE,
  CLIMB_LIST_FULL_MESSAGE,
  CLIMB_LIST_LIMIT_MESSAGE,
  CLIMB_LIST_NOT_FOUND_MESSAGE,
  CLIMB_LIST_UNAVAILABLE_MESSAGE,
  CLIMB_NOT_FOUND_MESSAGE,
  MAX_CLIMB_LISTS,
  MAX_CLIMB_LIST_ITEMS,
  climbListInputSchema,
} from "@/lib/climb-lists";
import { allowClimbListWrite } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";
import { parseShareToken } from "@/lib/share-token";
import { requirePositiveId } from "@/lib/validation";

import { afterCommit } from "./post-commit";
import { revalidateClimbListSurfaces } from "./revalidation";

const nowMs = sql`cast(unixepoch('subsecond') * 1000 as integer)`;

function parseInput(raw: unknown) {
  const parsed = climbListInputSchema.safeParse(raw);
  if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Check the form");
  return { title: parsed.data.title, description: parsed.data.description ?? null };
}

/** Lists have their own budget, apart from the journal's: building a list
 * means many quick adds in a row from a dialog that stays open. */
async function requireWriteBudget(userId: string) {
  if (!(await allowClimbListWrite(userId))) throw new ActionError(JOURNAL_RATE_LIMIT_MESSAGE);
}

function afterListChange(userId: string, listId?: number) {
  afterCommit(() => {
    revalidateClimbListSurfaces(userId, listId);
    refresh();
  });
}

/** Marks the list as changed, so the Lists tab puts it first. Run after an
 * item write; the owner condition makes it a no-op on anyone else's list. */
async function touchList(db: Database, userId: string, listId: number) {
  await db.run(sql`
    UPDATE climb_lists SET updated_at = ${nowMs}
    WHERE id = ${listId} AND user_id = ${userId}
  `);
}

async function ownsList(db: Database, userId: string, listId: number): Promise<boolean> {
  const row = await db.get<{ id: number }>(sql`
    SELECT id FROM climb_lists WHERE id = ${listId} AND user_id = ${userId}
  `);
  return row != null;
}

/** The list's climb count after a change, so a caller shows the real
 * number rather than guessing at +1 or -1. */
async function climbCount(db: Database, listId: number): Promise<number> {
  const row = await db.get<{ count: number }>(sql`
    SELECT COUNT(*) AS count FROM climb_list_items WHERE list_id = ${listId}
  `);
  return row?.count ?? 0;
}

/** What an add or remove did: whether the list changed, and its climb count
 * afterwards. Adding a climb already on the list, or removing one that isn't,
 * changes nothing. */
export type ClimbListItemChange = { changed: boolean; climbCount: number };

/** Appends a climb to the end of the owner's list, returning whether it was
 * added. Adding a climb that is already on it succeeds without moving it.
 * Ownership and the size cap are conditions on the INSERT, so a guessed id
 * writes nothing and concurrent adds cannot pass the cap. */
async function insertClimb(
  db: Database,
  userId: string,
  listId: number,
  climbId: number,
): Promise<boolean> {
  const [added] = await db.all<{ climbId: number }>(sql`
    INSERT INTO climb_list_items (list_id, climb_id, position)
    SELECT l.id, c.id,
           COALESCE((SELECT MAX(position) FROM climb_list_items WHERE list_id = l.id), 0) + 1
    FROM climb_lists l
    JOIN climbs c ON c.id = ${climbId}
    WHERE l.id = ${listId} AND l.user_id = ${userId}
      AND (SELECT COUNT(*) FROM climb_list_items WHERE list_id = l.id) < ${MAX_CLIMB_LIST_ITEMS}
    ON CONFLICT (list_id, climb_id) DO NOTHING
    RETURNING climb_id AS climbId
  `);
  if (added) return true;

  // Nothing was written. Say why only after proving the list is theirs.
  if (!(await ownsList(db, userId, listId))) throw new ActionError(CLIMB_LIST_NOT_FOUND_MESSAGE);
  const state = await db.get<{ present: number; climbExists: number }>(sql`
    SELECT
      EXISTS (SELECT 1 FROM climb_list_items WHERE list_id = ${listId} AND climb_id = ${climbId})
        AS present,
      EXISTS (SELECT 1 FROM climbs WHERE id = ${climbId}) AS climbExists
  `);
  if (state?.present === 1) return false;
  if (state?.climbExists !== 1) throw new ActionError(CLIMB_NOT_FOUND_MESSAGE);
  throw new ActionError(CLIMB_LIST_FULL_MESSAGE);
}

/** Creates a list, optionally with a first climb — the Add to list drawer's
 * "New list…". The cap is a condition on the INSERT, not a prior COUNT. */
export async function createClimbList(
  raw: unknown,
  options: { climbId?: number } = {},
): Promise<ActionResult<number>> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    await requireWriteBudget(user.id);
    const { title, description } = parseInput(raw);
    const climbId =
      options.climbId === undefined
        ? null
        : requirePositiveId(options.climbId, CLIMB_NOT_FOUND_MESSAGE);

    const db = await getDb();
    // Refuse a missing climb before making the list, so a bad id leaves no
    // empty list behind to count against the cap.
    if (climbId !== null) {
      const climb = await db.get<{ id: number }>(sql`SELECT id FROM climbs WHERE id = ${climbId}`);
      if (!climb) throw new ActionError(CLIMB_NOT_FOUND_MESSAGE);
    }
    const [created] = await db.all<{ id: number }>(sql`
      INSERT INTO climb_lists (user_id, title, description)
      SELECT ${user.id}, ${title}, ${description}
      WHERE (SELECT COUNT(*) FROM climb_lists WHERE user_id = ${user.id}) < ${MAX_CLIMB_LISTS}
      RETURNING id
    `);
    if (!created) throw new ActionError(CLIMB_LIST_LIMIT_MESSAGE);
    if (climbId !== null) {
      try {
        await insertClimb(db, user.id, created.id, climbId);
      } catch (error) {
        // The climb went away between the check and the insert (deleted or
        // merged). Take the new list back with it rather than leave it empty.
        await db.run(
          sql`DELETE FROM climb_lists WHERE id = ${created.id} AND user_id = ${user.id}`,
        );
        throw error;
      }
    }

    afterListChange(user.id, created.id);
    return created.id;
  });
}

export async function updateClimbList(listId: number, raw: unknown): Promise<ActionResult> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    const id = requirePositiveId(listId, CLIMB_LIST_NOT_FOUND_MESSAGE);
    await requireWriteBudget(user.id);
    const { title, description } = parseInput(raw);

    const db = await getDb();
    const [updated] = await db
      .update(climbLists)
      .set({ title, description })
      .where(and(eq(climbLists.id, id), eq(climbLists.userId, user.id)))
      .returning({ id: climbLists.id });
    if (!updated) throw new ActionError(CLIMB_LIST_NOT_FOUND_MESSAGE);

    afterListChange(user.id, id);
  });
}

/** Deletes the list, its climbs and its link. The climbs themselves, and
 * anyone's copies of the list, are untouched. */
export async function deleteClimbList(listId: number): Promise<ActionResult> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    const id = requirePositiveId(listId, CLIMB_LIST_NOT_FOUND_MESSAGE);
    await requireWriteBudget(user.id);

    const db = await getDb();
    await db.delete(climbLists).where(and(eq(climbLists.id, id), eq(climbLists.userId, user.id)));

    afterListChange(user.id, id);
  });
}

export async function addClimbToList(
  listId: number,
  climbId: number,
): Promise<ActionResult<ClimbListItemChange>> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    const list = requirePositiveId(listId, CLIMB_LIST_NOT_FOUND_MESSAGE);
    const climb = requirePositiveId(climbId, CLIMB_NOT_FOUND_MESSAGE);
    await requireWriteBudget(user.id);

    const db = await getDb();
    const changed = await insertClimb(db, user.id, list, climb);
    // Only a real change moves the list to the top of the Lists tab.
    if (changed) {
      await touchList(db, user.id, list);
      afterListChange(user.id, list);
    }
    return { changed, climbCount: await climbCount(db, list) };
  });
}

/** Removing a climb that is not on the list is not an error. Positions keep
 * their gap, which reads order by and never shows. Someone else's list reads
 * as not found, so a guessed id learns nothing about it. */
export async function removeClimbFromList(
  listId: number,
  climbId: number,
): Promise<ActionResult<ClimbListItemChange>> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    const list = requirePositiveId(listId, CLIMB_LIST_NOT_FOUND_MESSAGE);
    const climb = requirePositiveId(climbId, CLIMB_NOT_FOUND_MESSAGE);
    await requireWriteBudget(user.id);

    const db = await getDb();
    if (!(await ownsList(db, user.id, list))) throw new ActionError(CLIMB_LIST_NOT_FOUND_MESSAGE);
    const removed = await db.all<{ climbId: number }>(sql`
      DELETE FROM climb_list_items
      WHERE climb_id = ${climb}
        AND list_id IN (SELECT id FROM climb_lists WHERE id = ${list} AND user_id = ${user.id})
      RETURNING climb_id AS climbId
    `);
    const changed = removed.length > 0;
    if (changed) {
      await touchList(db, user.id, list);
      afterListChange(user.id, list);
    }
    return { changed, climbCount: await climbCount(db, list) };
  });
}

/**
 * Saves the owner's order: `climbIds` is every climb on the list, first to
 * last.
 *
 * One UPDATE rewrites every position, and only when the submitted climbs are
 * exactly the list's climbs. A list changed in another tab since the editor
 * loaded is refused rather than half-applied, so two edits cannot silently
 * overwrite each other.
 *
 * The editor sends this once, on Save order, so it spends one write from the
 * list budget like any other list change.
 */
export async function reorderClimbList(listId: number, climbIds: unknown): Promise<ActionResult> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    const list = requirePositiveId(listId, CLIMB_LIST_NOT_FOUND_MESSAGE);
    if (
      !Array.isArray(climbIds) ||
      climbIds.length > MAX_CLIMB_LIST_ITEMS ||
      !climbIds.every((id) => Number.isSafeInteger(id) && id > 0) ||
      new Set(climbIds).size !== climbIds.length
    )
      throw new ActionError(CLIMB_LIST_CHANGED_MESSAGE);
    const order = JSON.stringify(climbIds);
    await requireWriteBudget(user.id);

    const db = await getDb();
    // An empty order updates no rows whoever owns the list, so it can't prove
    // ownership the way a matched row count does. Check it directly.
    if (climbIds.length === 0 && !(await ownsList(db, user.id, list)))
      throw new ActionError(CLIMB_LIST_NOT_FOUND_MESSAGE);
    const updated = await db.all<{ climbId: number }>(sql`
      UPDATE climb_list_items
      SET position = (SELECT CAST(o.key AS INTEGER) + 1 FROM json_each(${order}) o
                      WHERE o.value = climb_list_items.climb_id)
      WHERE list_id = ${list}
        AND EXISTS (SELECT 1 FROM climb_lists WHERE id = ${list} AND user_id = ${user.id})
        AND (SELECT COUNT(*) FROM climb_list_items WHERE list_id = ${list})
            = json_array_length(${order})
        AND NOT EXISTS (
          SELECT 1 FROM climb_list_items current
          WHERE current.list_id = ${list}
            AND current.climb_id NOT IN (SELECT value FROM json_each(${order}))
        )
      RETURNING climb_id AS climbId
    `);
    if (updated.length !== climbIds.length) {
      if (!(await ownsList(db, user.id, list))) throw new ActionError(CLIMB_LIST_NOT_FOUND_MESSAGE);
      throw new ActionError(CLIMB_LIST_CHANGED_MESSAGE);
    }
    await touchList(db, user.id, list);

    afterListChange(user.id, list);
  });
}

type CopySource = { listId: number } | { token: string };

/**
 * Copies a list into the reader's own lists under the name and description
 * they chose. The climbs and their order come from the source as it is when
 * the copy is written; nothing links the copy back to it afterwards.
 *
 * The source is reachable by id when the reader may open its owner's lists
 * (always true for their own) or by a live link token. That check, and the
 * list cap, are conditions inside the write: a list hidden after the page
 * loaded cannot be copied.
 *
 * The list and its climbs are two INSERTs in one D1 batch, which is one
 * transaction. When the check fails, the first INSERT writes a NULL title,
 * which breaks the NOT NULL constraint and rolls the batch back. Inserting
 * nothing instead would let the second statement find the reader's newest
 * existing list and copy the climbs onto it.
 */
export async function copyClimbList(
  source: CopySource,
  raw: unknown,
): Promise<ActionResult<number>> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    await requireWriteBudget(user.id);
    const { title, description } = parseInput(raw);

    let access;
    if ("token" in source) {
      const token = parseShareToken(source.token);
      if (!token) throw new ActionError(CLIMB_LIST_UNAVAILABLE_MESSAGE);
      access = climbListLinkCoversSql(token);
    } else {
      const id = requirePositiveId(source.listId, CLIMB_LIST_UNAVAILABLE_MESSAGE);
      access = sql`l.id = ${id} AND ${climbListsVisibleSql(user.id, sql`l.user_id`)}`;
    }

    const db = await getDb();
    const sourceSql = sql`(SELECT l.id FROM climb_lists l WHERE ${access})`;
    const roomSql = sql`(SELECT COUNT(*) FROM climb_lists WHERE user_id = ${user.id}) < ${MAX_CLIMB_LISTS}`;

    // Give the precise reason when it is already true; the guarded batch
    // below is what makes the decision.
    const state = await db.get<{ source: number | null; room: number }>(
      sql`SELECT ${sourceSql} AS source, ${roomSql} AS room`,
    );
    if (state?.source == null) throw new ActionError(CLIMB_LIST_UNAVAILABLE_MESSAGE);
    if (state.room !== 1) throw new ActionError(CLIMB_LIST_LIMIT_MESSAGE);

    const newestOwnList = sql`(SELECT MAX(id) FROM climb_lists WHERE user_id = ${user.id})`;
    try {
      const [[created]] = await db.batch([
        db
          .insert(climbLists)
          .select(
            db
              .select({
                id: sql`NULL`.as("id"),
                userId: sql`${user.id}`.as("user_id"),
                title: sql`CASE WHEN ${sourceSql} IS NOT NULL AND ${roomSql}
                  THEN ${title} END`.as("title"),
                description: sql`${description}`.as("description"),
                createdAt: sql`${nowMs}`.as("created_at"),
                updatedAt: sql`${nowMs}`.as("updated_at"),
              })
              .from(sql`(SELECT 1)`),
          )
          .returning({ id: climbLists.id }),
        db.insert(climbListItems).select(
          db
            .select({
              listId: sql`${newestOwnList}`.as("list_id"),
              climbId: climbListItems.climbId,
              position: climbListItems.position,
              addedAt: sql`${nowMs}`.as("added_at"),
            })
            .from(climbListItems)
            .where(sql`${climbListItems.listId} = ${sourceSql}`),
        ),
      ]);
      if (!created) throw new ActionError(CLIMB_LIST_UNAVAILABLE_MESSAGE);

      afterListChange(user.id, created.id);
      return created.id;
    } catch (error) {
      if (errorChainIncludes(error, "NOT NULL constraint failed: climb_lists.title"))
        throw new ActionError(CLIMB_LIST_UNAVAILABLE_MESSAGE);
      throw error;
    }
  });
}
