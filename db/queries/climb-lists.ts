import { sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { ClimbListSort, ClimbListView } from "@/lib/climb-lists";
import type { ClimbType } from "@/lib/grades";

import { climbListsVisibleSql } from "./content-access";

export type ClimbListSummary = {
  id: number;
  title: string;
  description: string | null;
  climbCount: number;
  /** Milliseconds since the epoch. */
  updatedAt: number;
};

/** One climb on a list as a reader sees it. */
export type ClimbListItem = {
  climbId: number;
  name: string;
  type: ClimbType;
  grade: number | null;
  areaId: number;
  areaName: string;
  /** `YYYY-MM-DD` when the climb was reported broken, else null. */
  brokenOn: string | null;
  /** Stored order key. Gaps are allowed; show `number` instead. */
  position: number;
  /** 1-based place in the owner's order over the whole list, whatever the
   * reader sorted or filtered by. */
  number: number;
  /** Milliseconds since the epoch. */
  addedAt: number;
  /** Whether the READER has sent it: the viewer's own `sends` row, never the
   * owner's. Null for a signed-out reader, who has no sends. */
  sent: boolean | null;
};

const summaryColumnsSql = sql`
  l.id          AS id,
  l.title       AS title,
  l.description AS description,
  (SELECT COUNT(*) FROM climb_list_items i WHERE i.list_id = l.id) AS climbCount,
  l.updated_at  AS updatedAt
`;

/** A list is visible to the owner's lists audience, checked on every read. A
 * null viewer is a signed-out visitor, who gets nothing here: a list link
 * reads through db/queries/climb-list-shares.ts instead. */
function visibleListsSql(ownerId: string, viewerId: string | null): SQL {
  return sql`l.user_id = ${ownerId} AND ${climbListsVisibleSql(viewerId, sql`l.user_id`)}`;
}

/** Most recently changed first, with `id` breaking ties. */
export async function getClimbListsForUser(
  db: Database,
  ownerId: string,
  viewerId: string | null,
): Promise<ClimbListSummary[]> {
  return db.all<ClimbListSummary>(sql`
    SELECT ${summaryColumnsSql}
    FROM climb_lists l
    WHERE ${visibleListsSql(ownerId, viewerId)}
    ORDER BY l.updated_at DESC, l.id DESC
  `);
}

/** Filters by owner in the query, so a list id that belongs to someone else
 * returns nothing. */
export async function getClimbListForUser(
  db: Database,
  ownerId: string,
  listId: number,
  viewerId: string | null,
): Promise<ClimbListSummary | null> {
  const row = await db.get<ClimbListSummary>(sql`
    SELECT ${summaryColumnsSql}
    FROM climb_lists l
    WHERE ${visibleListsSql(ownerId, viewerId)} AND l.id = ${listId}
  `);
  return row ?? null;
}

/** Each sort's ORDER BY, over aliases `c` (climb), `i` (item) and
 * `area_path`. Every one ends on the owner's position, so ties keep the list's
 * order and a sorted view is stable.
 *
 * Grades are per-discipline ordinals (Hueco for boulders, YDS for routes), so
 * comparing them across disciplines would put V10 next to 5.10a. Boulders
 * sort ahead of routes, then by grade. */
const ORDER_BY: Record<ClimbListSort, SQL> = {
  position_asc: sql`i.position ASC`,
  position_desc: sql`i.position DESC`,
  grade_asc: sql`(c.type <> 'boulder'), (c.grade IS NULL), c.grade ASC, i.position ASC`,
  grade_desc: sql`(c.type <> 'boulder'), c.grade DESC, i.position ASC`,
  area_asc: sql`area_path.path COLLATE NOCASE ASC, i.position ASC`,
  area_desc: sql`area_path.path COLLATE NOCASE DESC, i.position ASC`,
  name_asc: sql`c.name COLLATE NOCASE ASC, i.position ASC`,
  name_desc: sql`c.name COLLATE NOCASE DESC, i.position ASC`,
  added_asc: sql`i.added_at ASC, i.position ASC`,
  added_desc: sql`i.added_at DESC, i.position ASC`,
};

function sentByViewerSql(viewerId: string | null): SQL {
  return viewerId === null
    ? sql`NULL`
    : sql`EXISTS (SELECT 1 FROM sends s WHERE s.user_id = ${viewerId} AND s.climb_id = c.id)`;
}

type ItemRow = Omit<ClimbListItem, "sent"> & { sent: number | null };

/**
 * The climbs on the one list that `listAccess` admits, sorted and filtered
 * for this reader.
 *
 * `listAccess` is a condition over the aliased list row `l` — the owner's
 * audience, or a live link — and sits in this statement's WHERE, so a list
 * hidden or unshared between two reads of a page returns nothing on the
 * second. The area sort walks each climb's area up to its root once per
 * distinct area; a list holds at most a few hundred climbs.
 */
export async function getClimbListItemsWhere(
  db: Database,
  listAccess: SQL,
  viewerId: string | null,
  view: ClimbListView,
): Promise<ClimbListItem[]> {
  const sent = sentByViewerSql(viewerId);
  const sentFilter =
    viewerId === null || view.sent === "all"
      ? sql``
      : view.sent === "sent"
        ? sql`AND ${sent}`
        : sql`AND NOT ${sent}`;
  const rows = await db.all<ItemRow>(sql`
    WITH RECURSIVE list_areas(id) AS (
      SELECT DISTINCT c.area_id
      FROM climb_lists l
      JOIN climb_list_items i ON i.list_id = l.id
      JOIN climbs c ON c.id = i.climb_id
      WHERE ${listAccess}
    ), walk(area_id, parent_id, path) AS (
      SELECT a.id, a.parent_id, a.name FROM list_areas la JOIN areas a ON a.id = la.id
      UNION ALL
      SELECT walk.area_id, p.parent_id, p.name || char(31) || walk.path
      FROM walk JOIN areas p ON p.id = walk.parent_id
    ), area_path(area_id, path) AS (
      SELECT area_id, path FROM walk WHERE parent_id IS NULL
    ), ranked(list_id, climb_id, number) AS (
      -- Numbered before the sent filter, so a filtered row keeps its place.
      SELECT i.list_id, i.climb_id,
             ROW_NUMBER() OVER (
               PARTITION BY i.list_id ORDER BY i.position, i.added_at, i.climb_id
             )
      FROM climb_lists l JOIN climb_list_items i ON i.list_id = l.id
      WHERE ${listAccess}
    )
    SELECT
      c.id         AS climbId,
      c.name       AS name,
      c.type       AS type,
      c.grade      AS grade,
      c.area_id    AS areaId,
      a.name       AS areaName,
      c.broken_on  AS brokenOn,
      i.position   AS position,
      ranked.number AS number,
      i.added_at   AS addedAt,
      ${sent}      AS sent
    FROM climb_lists l
    JOIN climb_list_items i ON i.list_id = l.id
    JOIN climbs c ON c.id = i.climb_id
    JOIN areas a ON a.id = c.area_id
    LEFT JOIN area_path ON area_path.area_id = c.area_id
    JOIN ranked ON ranked.list_id = i.list_id AND ranked.climb_id = i.climb_id
    WHERE ${listAccess} ${sentFilter}
    ORDER BY ${ORDER_BY[view.sort]}, i.added_at ASC, c.id ASC
  `);
  return rows.map((row) => ({ ...row, sent: row.sent === null ? null : row.sent === 1 }));
}

export function getClimbListItems(
  db: Database,
  ownerId: string,
  listId: number,
  viewerId: string | null,
  view: ClimbListView,
): Promise<ClimbListItem[]> {
  return getClimbListItemsWhere(
    db,
    sql`${visibleListsSql(ownerId, viewerId)} AND l.id = ${listId}`,
    viewerId,
    view,
  );
}

export type ClimbListChoice = {
  id: number;
  title: string;
  climbCount: number;
  /** Whether this climb is already on the list. */
  hasClimb: boolean;
};

/** The owner's own lists for the Add to list drawer on a climb page. */
export async function getClimbListChoices(
  db: Database,
  ownerId: string,
  climbId: number,
): Promise<ClimbListChoice[]> {
  const rows = await db.all<Omit<ClimbListChoice, "hasClimb"> & { hasClimb: number }>(sql`
    SELECT
      l.id    AS id,
      l.title AS title,
      (SELECT COUNT(*) FROM climb_list_items i WHERE i.list_id = l.id) AS climbCount,
      EXISTS (SELECT 1 FROM climb_list_items i WHERE i.list_id = l.id AND i.climb_id = ${climbId})
        AS hasClimb
    FROM climb_lists l
    WHERE l.user_id = ${ownerId}
    ORDER BY l.updated_at DESC, l.id DESC
  `);
  return rows.map((row) => ({ ...row, hasClimb: row.hasClimb === 1 }));
}

/** The owner's lists audience, for the note on their own Lists tab. A private
 * profile reads as Only me, which is what it means for everyone else. */
export async function getClimbListAudience(
  db: Database,
  ownerId: string,
): Promise<"private" | "friends" | "public"> {
  const row = await db.get<{ audience: "private" | "friends" | "public" }>(sql`
    SELECT CASE WHEN is_private THEN 'private' ELSE climb_list_visibility END AS audience
    FROM user WHERE id = ${ownerId}
  `);
  return row?.audience ?? "private";
}
