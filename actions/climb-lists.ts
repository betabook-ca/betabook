"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";

import { getDb, type Database } from "@/db/client";
import { climbListLinkCoversSql } from "@/db/queries/climb-list-shares";
import { climbListsVisibleSql } from "@/db/queries/content-access";
import { climbListItems, climbLists } from "@/db/schema";
import {
  ActionError,
  WRITE_RATE_LIMIT_MESSAGE,
  errorChainIncludes,
  toActionResult,
  type ActionResult,
} from "@/lib/action-result";
import {
  CLIMB_LIST_EDIT_INVALID_MESSAGE,
  CLIMB_LIST_FULL_MESSAGE,
  CLIMB_LIST_LIMIT_MESSAGE,
  CLIMB_LIST_NOT_FOUND_MESSAGE,
  CLIMB_LIST_UNAVAILABLE_MESSAGE,
  CLIMB_NOT_FOUND_MESSAGE,
  MAX_CLIMB_LISTS,
  MAX_CLIMB_LIST_ITEMS,
  climbListInputSchema,
} from "@/lib/climb-lists";
import { parseId } from "@/lib/parse-id";
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
  if (!(await allowClimbListWrite(userId))) throw new ActionError(WRITE_RATE_LIMIT_MESSAGE);
}

/** Revalidates the list's pages and refreshes the caller's. Run after every
 * successful write, a no-op add included: the client waits on this
 * refresh to show the list as it now is, which may have changed in another
 * tab. */
function afterListChange(userId: string, listId?: number) {
  afterCommit(() => {
    revalidateClimbListSurfaces(userId, listId);
    refresh();
  });
}

async function ownsList(db: Database, userId: string, listId: number): Promise<boolean> {
  const row = await db.get<{ id: number }>(sql`
    SELECT id FROM climb_lists WHERE id = ${listId} AND user_id = ${userId}
  `);
  return row != null;
}

/** The two statements that follow an item write in its batch: move the list
 * to the top of the Lists tab only when the write changed a row (`changes()`
 * is the write's, the statement before), then count the list's climbs so the
 * caller shows the real number rather than guessing at +1 or -1. */
function afterItemWrite(db: Database, userId: string, listId: number) {
  return [
    db
      .update(climbLists)
      .set({ updatedAt: sql`${nowMs}` })
      .where(and(eq(climbLists.id, listId), eq(climbLists.userId, userId), sql`changes() > 0`)),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(climbListItems)
      .where(eq(climbListItems.listId, listId)),
  ] as const;
}

/** What an add did: whether the list changed, and its climb count afterwards.
 * Adding a climb already on the list changes nothing. */
export type ClimbListItemChange = { changed: boolean; climbCount: number };

/** An add wrote nothing. Returns when the climb is already on the list, the
 * one case that isn't an error; otherwise throws the reason, and only after
 * proving the list is theirs. */
async function explainSkippedAdd(
  db: Database,
  userId: string,
  listId: number,
  climbId: number,
): Promise<void> {
  if (!(await ownsList(db, userId, listId))) throw new ActionError(CLIMB_LIST_NOT_FOUND_MESSAGE);
  const state = await db.get<{ present: number; climbExists: number }>(sql`
    SELECT
      EXISTS (SELECT 1 FROM climb_list_items WHERE list_id = ${listId} AND climb_id = ${climbId})
        AS present,
      EXISTS (SELECT 1 FROM climbs WHERE id = ${climbId}) AS climbExists
  `);
  if (state?.present === 1) return;
  if (state?.climbExists !== 1) throw new ActionError(CLIMB_NOT_FOUND_MESSAGE);
  throw new ActionError(CLIMB_LIST_FULL_MESSAGE);
}

/** Creates a list, optionally with a first climb — the Add to list drawer's
 * "New list…". The cap is a condition on the INSERT, not a prior COUNT.
 *
 * With a first climb, the list and the climb are one D1 batch. When the cap
 * is reached or the climb doesn't exist, the list INSERT writes a NULL title,
 * which breaks the NOT NULL constraint and rolls the batch back, so a refused
 * create leaves no empty list behind (the guard `copyClimbList` uses). */
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
    const roomSql = sql`(SELECT COUNT(*) FROM climb_lists WHERE user_id = ${user.id}) < ${MAX_CLIMB_LISTS}`;

    if (climbId === null) {
      const [created] = await db.all<{ id: number }>(sql`
        INSERT INTO climb_lists (user_id, title, description)
        SELECT ${user.id}, ${title}, ${description}
        WHERE ${roomSql}
        RETURNING id
      `);
      if (!created) throw new ActionError(CLIMB_LIST_LIMIT_MESSAGE);
      afterListChange(user.id, created.id);
      return created.id;
    }

    const climbExistsSql = sql`EXISTS (SELECT 1 FROM climbs WHERE id = ${climbId})`;
    try {
      const [[created]] = await db.batch([
        db
          .insert(climbLists)
          .select(
            db
              .select({
                id: sql`NULL`.as("id"),
                userId: sql`${user.id}`.as("user_id"),
                title: sql`CASE WHEN ${roomSql} AND ${climbExistsSql} THEN ${title} END`.as(
                  "title",
                ),
                description: sql`${description}`.as("description"),
                createdAt: sql`${nowMs}`.as("created_at"),
                updatedAt: sql`${nowMs}`.as("updated_at"),
              })
              .from(sql`(SELECT 1)`),
          )
          .returning({ id: climbLists.id }),
        db
          .insert(climbListItems)
          .values({ listId: sql`last_insert_rowid()`, climbId, position: 1 }),
      ]);
      afterListChange(user.id, created.id);
      return created.id;
    } catch (error) {
      if (!errorChainIncludes(error, "NOT NULL constraint failed: climb_lists.title")) throw error;
      // Rolled back. Name the reason, which was true when the batch ran.
      const state = await db.get<{ room: number }>(sql`SELECT ${roomSql} AS room`);
      throw new ActionError(state?.room === 1 ? CLIMB_NOT_FOUND_MESSAGE : CLIMB_LIST_LIMIT_MESSAGE);
    }
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
    // Appends to the end of the owner's list. Ownership and the size cap are
    // conditions on the INSERT, so a guessed id writes nothing and concurrent
    // adds cannot pass the cap. A climb already on the list keeps its place.
    const [added, , counted] = await db.batch([
      db
        .insert(climbListItems)
        .select(
          db
            .select({
              listId: sql`l.id`.as("list_id"),
              climbId: sql`c.id`.as("climb_id"),
              position: sql`COALESCE(
                (SELECT MAX(position) FROM climb_list_items WHERE list_id = l.id), 0) + 1`.as(
                "position",
              ),
              addedAt: sql`${nowMs}`.as("added_at"),
            })
            .from(sql`climb_lists l JOIN climbs c ON c.id = ${climb}`)
            .where(sql`l.id = ${list} AND l.user_id = ${user.id}
              AND (SELECT COUNT(*) FROM climb_list_items WHERE list_id = l.id)
                < ${MAX_CLIMB_LIST_ITEMS}`),
        )
        .onConflictDoNothing()
        .returning({ climbId: climbListItems.climbId }),
      ...afterItemWrite(db, user.id, list),
    ]);
    const changed = added.length > 0;
    if (!changed) await explainSkippedAdd(db, user.id, list, climb);

    afterListChange(user.id, list);
    return { changed, climbCount: counted[0]?.count ?? 0 };
  });
}

function isClimbIdArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) && value.every((id) => typeof id === "number" && parseId(id) !== null)
  );
}

/**
 * Saves the owner's edits from the list editor: `climbIds` is the list as the
 * editor shows it, first to last, including `addedIds`, the climbs added in
 * the editor; `removedIds` are the climbs the owner took off.
 *
 * The owner's Save writes what they see, even if another tab changed the list
 * since the editor opened:
 * - every climb in the editor's order is on the list afterwards, in that
 *   order, put back if another tab took it off;
 * - only the climbs the owner removed are deleted;
 * - climbs the editor never showed (added in another tab, or from a climb's
 *   page) stay, after the editor's order, in their existing order;
 * - a climb deleted since (a moderator can delete one that is on lists) is
 *   skipped wherever it appears, as lists already lose deleted climbs.
 *
 * Positions come out 1…n with no gaps, and rows already on the list keep
 * their `added_at`. One batch does it all, the list's `updated_at` included,
 * so it applies whole or not at all. The editor sends this once, on Save, so
 * it spends one write from the list budget like any other list change.
 */
export async function saveClimbListEdits(
  listId: number,
  climbIds: unknown,
  removedIds: unknown = [],
  addedIds: unknown = [],
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    const list = requirePositiveId(listId, CLIMB_LIST_NOT_FOUND_MESSAGE);
    if (!isClimbIdArray(climbIds) || !isClimbIdArray(removedIds) || !isClimbIdArray(addedIds))
      throw new ActionError(CLIMB_LIST_EDIT_INVALID_MESSAGE);
    const every = [...climbIds, ...removedIds];
    const kept = new Set(climbIds);
    if (
      climbIds.length > MAX_CLIMB_LIST_ITEMS ||
      new Set(every).size !== every.length ||
      new Set(addedIds).size !== addedIds.length ||
      !addedIds.every((id) => kept.has(id))
    )
      throw new ActionError(CLIMB_LIST_EDIT_INVALID_MESSAGE);
    await requireWriteBudget(user.id);

    const db = await getDb();
    if (!(await ownsList(db, user.id, list))) throw new ActionError(CLIMB_LIST_NOT_FOUND_MESSAGE);

    const order = JSON.stringify(climbIds);
    // Every statement repeats the owner condition, so a list deleted between
    // the check above and the batch is left alone.
    const owned = sql`EXISTS (SELECT 1 FROM climb_lists WHERE id = ${list} AND user_id = ${user.id})`;
    await db.batch([
      // Put back every climb in the editor's order that isn't on the list:
      // the ones added here, and any another tab took off. The join skips
      // climbs that no longer exist; the renumber below fixes positions.
      db
        .insert(climbListItems)
        .select(
          db
            .select({
              listId: sql`${list}`.as("list_id"),
              climbId: sql`c.id`.as("climb_id"),
              position: sql`CAST(o.key AS INTEGER) + 1`.as("position"),
              addedAt: sql`${nowMs}`.as("added_at"),
            })
            .from(sql`json_each(${order}) o JOIN climbs c ON c.id = o.value`)
            .where(owned),
        )
        .onConflictDoNothing(),
      db
        .delete(climbListItems)
        .where(
          and(
            eq(climbListItems.listId, list),
            sql`${climbListItems.climbId} IN (SELECT value FROM json_each(${JSON.stringify(removedIds)}))`,
            owned,
          ),
        ),
      // 1…n over what is now on the list: the editor's order first, then the
      // climbs it never showed in their existing order. The ranks are
      // computed once in the FROM subquery, before any row changes, so
      // reading `position` there sees only the old values.
      db
        .update(climbListItems)
        .set({ position: sql`ranked.pos` })
        .from(
          sql`(
            SELECT i.climb_id AS climb_id,
                   ROW_NUMBER() OVER (
                     ORDER BY o.key IS NULL, CAST(o.key AS INTEGER),
                              i.position, i.added_at, i.climb_id
                   ) AS pos
            FROM climb_list_items i
            LEFT JOIN json_each(${order}) o ON o.value = i.climb_id
            WHERE i.list_id = ${list}
          ) AS ranked`,
        )
        .where(
          and(
            eq(climbListItems.listId, list),
            sql`ranked.climb_id = ${climbListItems.climbId}`,
            owned,
          ),
        ),
      db
        .update(climbLists)
        .set({ updatedAt: sql`${nowMs}` })
        .where(and(eq(climbLists.id, list), eq(climbLists.userId, user.id))),
    ]);

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
