import { eq, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import { areas } from "@/db/schema";
import { AREA_SEARCH_PAGE_SIZE } from "@/lib/page-sizes";

import { toFtsPrefixQuery } from "./shared";

export type Area = typeof areas.$inferSelect;

export async function getArea(db: Database, id: number): Promise<Area | undefined> {
  return db.select().from(areas).where(eq(areas.id, id)).get();
}

export async function countAreas(db: Database): Promise<number> {
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(areas)
    .get();
  return row?.count ?? 0;
}

export async function getAreaSitemapRows(
  db: Database,
  limit: number,
  offset: number,
): Promise<{ id: number; name: string }[]> {
  return db
    .select({ id: areas.id, name: areas.name })
    .from(areas)
    .orderBy(areas.id)
    .limit(limit)
    .offset(offset)
    .all();
}

/** Use the candidate only if it descends from the displayed area. Walking upward
 * keeps validation proportional to tree depth rather than subtree size. */
export async function resolveSubareaScope(
  db: Database,
  area: Area,
  subareaId: number | null,
): Promise<Area> {
  if (subareaId == null || subareaId === area.id) return area;
  const sub = await getArea(db, subareaId);
  if (!sub) return area;

  const [row] = await db.all<{ found: number }>(sql`
    WITH RECURSIVE chain(id) AS (
      SELECT parent_id FROM areas WHERE id = ${sub.id}
      UNION ALL
      SELECT areas.parent_id FROM chain
      JOIN areas ON areas.id = chain.id
      WHERE areas.parent_id IS NOT NULL
    )
    SELECT 1 AS found FROM chain WHERE id = ${area.id} LIMIT 1
  `);
  return row ? sub : area;
}

/** Sort direct children with localeCompare: SQLite NOCASE only folds ASCII,
 * which puts accented names after Z. */
export async function getSubareas(db: Database, areaId: number): Promise<Area[]> {
  const rows = await db.select().from(areas).where(eq(areas.parentId, areaId));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Root-first ancestors, excluding the area itself. */
export async function getAncestors(db: Database, area: Area): Promise<Area[]> {
  if (area.parentId == null) return [];

  return db.all<Area>(sql`
    WITH RECURSIVE ancestors(id, depth) AS (
      SELECT id, 0 FROM areas WHERE id = ${area.parentId}
      UNION ALL
      SELECT areas.parent_id, ancestors.depth + 1
      FROM ancestors
      JOIN areas ON areas.id = ancestors.id
      WHERE areas.parent_id IS NOT NULL
    )
    SELECT areas.id AS id, areas.parent_id AS parentId, areas.name AS name,
           areas.description AS description
    FROM areas
    JOIN ancestors ON areas.id = ancestors.id
    ORDER BY ancestors.depth DESC
  `);
}

/** Match named areas and their descendants once, avoiding a correlated tree walk
 * per result row. Callers must join the row's area as `areas`.
 * Returns null for no filter and sql`0` for a name with no matchable tokens. */
export function areaNameCondition(areaName: string | undefined): SQL | null {
  if (!areaName) return null;
  const query = toFtsPrefixQuery(areaName);
  if (!query) return sql`0`;

  // UNION, not UNION ALL: when one matched area nests inside another, the
  // same descendant is reachable by more than one path.
  return sql`areas.id IN (
    WITH RECURSIVE matched(id) AS (
      SELECT matched_area.id FROM areas matched_area
      JOIN areas_fts ON areas_fts.rowid = matched_area.id
      WHERE areas_fts MATCH ${query}
      UNION
      SELECT child.id FROM areas child JOIN matched ON child.parent_id = matched.id
    )
    SELECT id FROM matched
  )`;
}

export type AreaBreadcrumbs = Record<number, { id: number; name: string }[]>;

type BreadcrumbRow = {
  targetId: number;
  ancestorId: number | null;
  ancestorName: string | null;
};

/** Batch up to `depth` ancestors per area. Existing root areas map to [];
 * nonexistent IDs are omitted. */
export async function getAreaBreadcrumbs(
  db: Database,
  areaIds: number[],
  depth = 2,
): Promise<AreaBreadcrumbs> {
  const ids = [...new Set(areaIds)];
  if (ids.length === 0) return {};

  // One JSON binding for IDs keeps large export batches under D1's parameter limit.
  const rows = await db.all<BreadcrumbRow>(sql`
    WITH RECURSIVE requested(id) AS (
      SELECT CAST(value AS INTEGER) FROM json_each(${JSON.stringify(ids)})
    ), chain(target_id, ancestor_id, dist) AS (
      SELECT areas.id, areas.parent_id, 1 FROM requested
      JOIN areas ON areas.id = requested.id
      WHERE areas.parent_id IS NOT NULL
      UNION ALL
      SELECT chain.target_id, areas.parent_id, chain.dist + 1
      FROM chain
      JOIN areas ON areas.id = chain.ancestor_id
      WHERE areas.parent_id IS NOT NULL AND chain.dist < ${depth}
    )
    SELECT target.id AS targetId, ancestor.id AS ancestorId, ancestor.name AS ancestorName
    FROM requested
    JOIN areas target ON target.id = requested.id
    LEFT JOIN chain ON chain.target_id = target.id
    LEFT JOIN areas ancestor ON ancestor.id = chain.ancestor_id
    ORDER BY target.id ASC, chain.dist DESC
  `);

  const breadcrumbs: AreaBreadcrumbs = {};
  for (const row of rows) {
    if (!(row.targetId in breadcrumbs)) breadcrumbs[row.targetId] = [];
    if (row.ancestorId != null && row.ancestorName != null) {
      breadcrumbs[row.targetId].push({ id: row.ancestorId, name: row.ancestorName });
    }
  }
  return breadcrumbs;
}

export type AreaWithAncestorPath = Area & { ancestorPath: string | null };

export { AREA_SEARCH_PAGE_SIZE };

export type SearchAreasPage = { areas: AreaWithAncestorPath[]; hasNextPage: boolean };

/** Returns root-first ancestor paths. ID breaks tied FTS ranks for stable pagination. */
export async function searchAreas(
  db: Database,
  name: string,
  page = 1,
  pageSize = AREA_SEARCH_PAGE_SIZE,
): Promise<SearchAreasPage> {
  const query = toFtsPrefixQuery(name);
  if (!query) return { areas: [], hasNextPage: false };

  const rows = await db.all<AreaWithAncestorPath>(sql`
    WITH RECURSIVE matched(area_id, score) AS (
      SELECT areas.id, bm25(areas_fts)
      FROM areas
      JOIN areas_fts ON areas_fts.rowid = areas.id
      WHERE areas_fts MATCH ${query}
      ORDER BY bm25(areas_fts), areas.id
      LIMIT ${pageSize + 1}
      OFFSET ${(page - 1) * pageSize}
    ), ancestor_chain(area_id, ancestor_id, dist) AS (
      SELECT matched.area_id, areas.parent_id, 1
      FROM matched
      JOIN areas ON areas.id = matched.area_id
      WHERE areas.parent_id IS NOT NULL
      UNION ALL
      SELECT ancestor_chain.area_id, areas.parent_id, ancestor_chain.dist + 1
      FROM ancestor_chain
      JOIN areas ON areas.id = ancestor_chain.ancestor_id
      WHERE areas.parent_id IS NOT NULL
    )
    SELECT areas.id AS id, areas.parent_id AS parentId, areas.name AS name,
           areas.description AS description, (
      -- GROUP_CONCAT joins rows in the order it receives them, so the
      -- ORDER BY belongs on a subquery it consumes. Placed beside the
      -- aggregate it would order that query's single output row instead,
      -- leaving the concatenation to follow incidental scan order.
      SELECT GROUP_CONCAT(name, ' > ') FROM (
        SELECT ancestor.name AS name
        FROM ancestor_chain
        JOIN areas ancestor ON ancestor.id = ancestor_chain.ancestor_id
        WHERE ancestor_chain.area_id = areas.id
        ORDER BY ancestor_chain.dist DESC
      )
    ) AS ancestorPath
    FROM matched
    JOIN areas ON areas.id = matched.area_id
    ORDER BY matched.score, areas.id
  `);

  return {
    areas: rows.slice(0, pageSize),
    hasNextPage: rows.length > pageSize,
  };
}

export async function getAreasByIds(db: Database, ids: number[]): Promise<Area[]> {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(areas)
    .where(
      sql`${areas.id} IN (SELECT CAST(value AS INTEGER) FROM json_each(${JSON.stringify(ids)}))`,
    )
    .all();
}

/** An exact selected area includes its descendants, never another area with the same name. */
export function areaIdCondition(areaId: number): SQL {
  return sql`climbs.area_id IN (
    WITH RECURSIVE subtree(id) AS (
      SELECT id FROM areas WHERE id = ${areaId}
      UNION ALL
      SELECT a.id FROM areas a JOIN subtree s ON a.parent_id = s.id
    ) SELECT id FROM subtree
  )`;
}
