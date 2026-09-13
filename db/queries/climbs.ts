import { eq, getTableColumns, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import { areas, climbs } from "@/db/schema";
import { MAX_RATING } from "@/lib/filters/climb-stats-filter";
import type { DisciplineGradeFilter } from "@/lib/filters/discipline-filter";
import type { Discipline } from "@/lib/grades";

import { areaIdCondition, areaNameCondition, type Area } from "./areas";
import { PAGE_SIZE, disciplineGradeConditions, toFtsPrefixQuery } from "./shared";

export type Climb = typeof climbs.$inferSelect;

export async function getClimb(db: Database, id: number): Promise<Climb | undefined> {
  return db.select().from(climbs).where(eq(climbs.id, id)).get();
}

export async function countClimbs(db: Database): Promise<number> {
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(climbs)
    .get();
  return row?.count ?? 0;
}

export async function getClimbSitemapRows(
  db: Database,
  limit: number,
  offset: number,
): Promise<{ id: number; name: string }[]> {
  return db
    .select({ id: climbs.id, name: climbs.name })
    .from(climbs)
    .orderBy(climbs.id)
    .limit(limit)
    .offset(offset)
    .all();
}

export async function hasClimbsInArea(db: Database, areaId: number): Promise<boolean> {
  const row = await db
    .select({ id: climbs.id })
    .from(climbs)
    .where(eq(climbs.areaId, areaId))
    .limit(1)
    .get();
  return row != null;
}

export type SubtreeClimbsSort =
  | "name_asc"
  | "name_desc"
  | "grade_asc"
  | "grade_desc"
  | "rating_asc"
  | "rating_desc"
  | "ascents_asc"
  | "ascents_desc";

// Keep NULL-ordering expressions aligned with the expression indexes in
// 0012_climb_sort_indexes.sql so ascending scans can use those indexes.
const SUBTREE_CLIMBS_ORDER_BY: Record<SubtreeClimbsSort, SQL> = {
  name_asc: sql`climbs.name ASC`,
  name_desc: sql`climbs.name DESC`,
  grade_asc: sql`(climbs.grade IS NULL), climbs.grade ASC`,
  grade_desc: sql`climbs.grade DESC`,
  rating_asc: sql`(climbs.avg_rating IS NULL), climbs.avg_rating ASC`,
  rating_desc: sql`climbs.avg_rating DESC`,
  ascents_asc: sql`climbs.send_count ASC`,
  ascents_desc: sql`climbs.send_count DESC`,
};

/** Extra tie-breaks are only used when the query already sorts its results.
 * The large-subtree path must match its sort index and uses only ID for ties. */
const SUBTREE_CLIMBS_TIE_BREAK: Record<"name" | "grade" | "rating" | "ascents", SQL> = {
  name: sql`climbs.grade DESC, climbs.avg_rating DESC, climbs.send_count DESC`,
  grade: sql`climbs.name ASC, climbs.avg_rating DESC, climbs.send_count DESC`,
  rating: sql`climbs.name ASC, climbs.grade DESC, climbs.send_count DESC`,
  ascents: sql`climbs.name ASC, climbs.grade DESC, climbs.avg_rating DESC`,
};

function sortTieBreak(sort: SubtreeClimbsSort): SQL {
  const field = sort.replace(/_(asc|desc)$/, "") as keyof typeof SUBTREE_CLIMBS_TIE_BREAK;
  return SUBTREE_CLIMBS_TIE_BREAK[field];
}

export type { Discipline } from "@/lib/grades";
export type { DisciplineGradeFilter } from "@/lib/filters/discipline-filter";

/** UNION ALL is safe from a single root: cycle guards keep the hierarchy a tree. */
function subtreeAreaIds(areaId: number): SQL {
  return sql`
    WITH RECURSIVE subtree(id) AS (
      SELECT ${areaId}
      UNION ALL
      SELECT a.id FROM areas a JOIN subtree s ON a.parent_id = s.id
    )`;
}

// Small subtrees use the area index and sort their candidates; large ones
// scan the chosen sort index and stop at LIMIT. Area count is a heuristic
// for climb count; see climbs.large-area.test.ts for query-plan coverage.
export const LARGE_AREA_SUBTREE_AREAS = 1000;

/** Short prefixes favor the sort index; longer terms use FTS to find rare matches. */
const MIN_LARGE_AREA_FTS_DRIVER_TERM_LENGTH = 3;

/** Stop counting at the classification threshold. The LIMIT and comparison
 * must agree; recursive queue work still depends on the tree's fan-out. */
function reachesLargeSubtree(areaId: number): SQL<number> {
  return sql<number>`(SELECT count(*) FROM (
    ${subtreeAreaIds(areaId)}
    SELECT id FROM subtree LIMIT ${LARGE_AREA_SUBTREE_AREAS}
  )) >= ${LARGE_AREA_SUBTREE_AREAS}`;
}

async function isLargeSubtree(db: Database, areaId: number): Promise<boolean> {
  const rows = await db.all<{ large: number }>(sql`SELECT ${reachesLargeSubtree(areaId)} AS large`);
  return rows[0]?.large === 1;
}

export type AreaWithSubtreeSize = Area & { largeSubtree: boolean };

/** Loads the area and index-selection hint in one round trip. */
export async function getAreaWithSubtreeSize(
  db: Database,
  id: number,
): Promise<AreaWithSubtreeSize | undefined> {
  const row = await db
    .select({ ...getTableColumns(areas), largeSubtree: reachesLargeSubtree(id) })
    .from(areas)
    .where(eq(areas.id, id))
    .get();

  return row && { ...row, largeSubtree: row.largeSubtree === 1 };
}

const SUBTREE_CLIMBS_SORT_INDEX: Record<SubtreeClimbsSort, string> = {
  name_asc: "climbs_name_asc_idx",
  name_desc: "climbs_name_desc_idx",
  grade_asc: "climbs_grade_asc_idx",
  grade_desc: "climbs_grade_desc_idx",
  rating_asc: "climbs_avg_rating_asc_idx",
  rating_desc: "climbs_avg_rating_desc_idx",
  ascents_asc: "climbs_send_count_asc_idx",
  ascents_desc: "climbs_send_count_desc_idx",
};

export type ClimbStatsFilter = {
  ratingRange?: [number, number];
  minAscents?: number;
};

/** Unrated averages are SQL NULL, not zero. The displayed 1–5 range is
 * inactive, so omit both predicates to keep NULLs. Any narrowed bound uses
 * a normal comparison, which excludes NULLs. Zero is a legacy unbounded sentinel. */
function climbStatsConditions(filter: ClimbStatsFilter): SQL[] {
  const clauses: SQL[] = [];
  if (filter.ratingRange) {
    const [min, max] = filter.ratingRange;
    if (min > 1) clauses.push(sql`climbs.avg_rating >= ${min}`);
    if (max > 0 && max < MAX_RATING) clauses.push(sql`climbs.avg_rating <= ${max}`);
  }
  if (filter.minAscents) {
    clauses.push(sql`climbs.send_count >= ${filter.minAscents}`);
  }
  return clauses;
}

/** Pass AreaWithSubtreeSize to reuse the area lookup's index-selection hint. */
// oxlint-disable-next-line complexity -- sort / discipline / pagination / large-subtree branches
export async function getSubtreeClimbs(
  db: Database,
  area: Area | AreaWithSubtreeSize,
  page = 1,
  sort: SubtreeClimbsSort = "ascents_desc",
  filter?: DisciplineGradeFilter & { name?: string } & ClimbStatsFilter,
  pageSize = PAGE_SIZE,
  offset = (page - 1) * pageSize,
): Promise<{ climbs: ClimbWithAreaName[]; page: number; pageSize: number; hasNextPage: boolean }> {
  const conditions: SQL[] = [sql`climbs.area_id IN (SELECT id FROM subtree)`];

  const nameQuery = filter?.name ? toFtsPrefixQuery(filter.name) : null;
  if (filter?.name && !nameQuery) return { climbs: [], page, pageSize, hasNextPage: false };

  if (filter) {
    const disciplineClauses = disciplineGradeConditions(filter);
    if (disciplineClauses.length > 0) {
      conditions.push(sql`(${sql.join(disciplineClauses, sql` OR `)})`);
    }
    conditions.push(...climbStatsConditions(filter));
  }

  // Only allow known sort keys before inserting an index name with sql.raw.
  if (!Object.prototype.hasOwnProperty.call(SUBTREE_CLIMBS_SORT_INDEX, sort)) {
    throw new Error(`Invalid sort value: ${sort}`);
  }

  const isLarge = "largeSubtree" in area ? area.largeSubtree : await isLargeSubtree(db, area.id);
  // Rare names use FTS first; scanning a global sort index could exhaust it
  // without finding a match. Broad prefixes instead probe FTS per candidate.
  const longestNameTerm = Math.max(
    0,
    ...(filter?.name
      ?.trim()
      .split(/\s+/)
      .map((term) => term.length) ?? []),
  );
  const useNameIndex =
    isLarge && nameQuery !== null && longestNameTerm >= MIN_LARGE_AREA_FTS_DRIVER_TERM_LENGTH;
  if (nameQuery) {
    conditions.push(
      useNameIndex
        ? sql`climbs_fts MATCH ${nameQuery}`
        : isLarge
          ? sql`EXISTS (
              SELECT 1 FROM climbs_fts
              WHERE climbs_fts.rowid = climbs.id AND climbs_fts MATCH ${nameQuery}
            )`
          : sql`climbs.id IN (
              SELECT rowid FROM climbs_fts WHERE climbs_fts MATCH ${nameQuery}
            )`,
    );
  }
  const indexName = isLarge ? SUBTREE_CLIMBS_SORT_INDEX[sort] : "climbs_area_idx";

  // The large-area sort scan must keep an ORDER BY satisfied by its index.
  const orderBy =
    isLarge && !useNameIndex
      ? sql`${SUBTREE_CLIMBS_ORDER_BY[sort]}, climbs.id`
      : sql`${SUBTREE_CLIMBS_ORDER_BY[sort]}, ${sortTieBreak(sort)}, climbs.id`;
  const climbSource = useNameIndex
    ? sql`climbs_fts JOIN climbs ON climbs.id = climbs_fts.rowid`
    : sql`climbs INDEXED BY ${sql.raw(indexName)}`;

  const rows = await db.all<ClimbWithAreaName>(sql`
    ${subtreeAreaIds(area.id)}
    SELECT climbs.id AS id, climbs.area_id AS areaId, climbs.name AS name,
           climbs.type AS type, climbs.grade AS grade, areas.name AS areaName
    FROM ${climbSource}
    JOIN areas ON areas.id = climbs.area_id
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY ${orderBy}
    LIMIT ${pageSize + 1}
    OFFSET ${offset}
  `);

  const hasNextPage = rows.length > pageSize;
  return {
    climbs: rows.slice(0, pageSize),
    page,
    pageSize,
    hasNextPage,
  };
}

export type GradeHistogramRow = { type: Discipline; grade: number | null; count: number };

/** Reads every climb in the subtree; callers skip this histogram for large areas. */
export async function getSubtreeGradeHistogram(
  db: Database,
  area: Area,
): Promise<GradeHistogramRow[]> {
  return db.all<GradeHistogramRow>(sql`
    ${subtreeAreaIds(area.id)}
    SELECT climbs.type AS type, climbs.grade AS grade, COUNT(*) AS count
    FROM climbs
    WHERE climbs.area_id IN (SELECT id FROM subtree)
    GROUP BY climbs.type, climbs.grade
  `);
}

export type ClimbSummary = Pick<Climb, "id" | "areaId" | "name" | "type" | "grade">;

/** Missing IDs are omitted. A single JSON binding avoids D1's parameter limit. */
export async function getClimbsByIds(
  db: Database,
  ids: readonly number[],
): Promise<ClimbSummary[]> {
  const distinct = [...new Set(ids)];
  if (distinct.length === 0) return [];
  return db.all<ClimbSummary>(sql`
    SELECT climbs.id AS id, climbs.area_id AS areaId, climbs.name AS name,
           climbs.type AS type, climbs.grade AS grade
    FROM climbs
    WHERE climbs.id IN (SELECT CAST(value AS INTEGER) FROM json_each(${JSON.stringify(distinct)}))
  `);
}

export type ClimbCandidate = Pick<
  Climb,
  "id" | "areaId" | "name" | "type" | "grade" | "sendCount"
> & {
  /** SQLite LOWER(TRIM(name)); must match foldClimbName on the CSV side. */
  key: string;
  areaName: string;
  /** Root-first ancestors, excluding the climb's own area. */
  ancestors: { id: number; name: string }[];
  /** Total matches before the per-name cap. */
  total: number;
};

export const CLIMB_CANDIDATES_PER_NAME = 25;

type ClimbCandidateRow = Omit<ClimbCandidate, "ancestors"> & { ancestors: string };

function toCandidates(rows: ClimbCandidateRow[]): ClimbCandidate[] {
  return rows.map((row) => ({
    ...row,
    ancestors: JSON.parse(row.ancestors) as ClimbCandidate["ancestors"],
  }));
}

/** Area-specific lookup bypasses the name-only cap. The area may be an ancestor;
 * `total` still counts all climbs with that name. */
export async function findClimbCandidatesInAreas(
  db: Database,
  pairs: readonly { name: string; areaName: string }[],
): Promise<ClimbCandidate[]> {
  if (pairs.length === 0) return [];

  // Seed each climb's own area at depth 0 to reuse the walk for matching and breadcrumbs.
  const rows = await db.all<ClimbCandidateRow>(sql`
    WITH RECURSIVE wanted(key, area) AS (
      SELECT LOWER(TRIM(json_extract(value, '$.name'))), LOWER(TRIM(json_extract(value, '$.areaName')))
      FROM json_each(${JSON.stringify(pairs)})
    ), named AS (
      SELECT climbs.id, climbs.area_id, climbs.name, climbs.type, climbs.grade,
             climbs.send_count, LOWER(TRIM(climbs.name)) AS key,
             COUNT(*) OVER (PARTITION BY LOWER(TRIM(climbs.name))) AS total
      FROM climbs
      WHERE LOWER(TRIM(climbs.name)) IN (SELECT key FROM wanted)
    ), chain(climb_id, area_id, dist) AS (
      SELECT named.id, named.area_id, 0 FROM named
      UNION ALL
      SELECT chain.climb_id, areas.parent_id, chain.dist + 1
      FROM chain
      JOIN areas ON areas.id = chain.area_id
      WHERE areas.parent_id IS NOT NULL
    ), matched AS (
      SELECT named.* FROM named
      WHERE EXISTS (
        SELECT 1 FROM chain
        JOIN areas ON areas.id = chain.area_id
        JOIN wanted ON wanted.key = named.key AND wanted.area = LOWER(TRIM(areas.name))
        WHERE chain.climb_id = named.id
      )
    )
    SELECT matched.id AS id, matched.key AS key, matched.name AS name,
           matched.type AS type, matched.grade AS grade,
           matched.area_id AS areaId, areas.name AS areaName,
           matched.send_count AS sendCount, matched.total AS total, (
      SELECT json_group_array(json_object('id', a.id, 'name', a.name)) FROM (
        SELECT ancestor.id AS id, ancestor.name AS name
        FROM chain
        JOIN areas ancestor ON ancestor.id = chain.area_id
        WHERE chain.climb_id = matched.id AND chain.dist > 0
        ORDER BY chain.dist DESC
      ) a
    ) AS ancestors
    FROM matched
    JOIN areas ON areas.id = matched.area_id
    ORDER BY matched.key, matched.send_count DESC, matched.id
  `);

  return toCandidates(rows);
}

/** Exact folded-name matches, most-ascended first within each name.
 * Window functions provide the per-name cap and uncapped total in one pass. */
export async function findClimbCandidatesByNames(
  db: Database,
  names: readonly string[],
): Promise<ClimbCandidate[]> {
  if (names.length === 0) return [];

  const rows = await db.all<ClimbCandidateRow>(sql`
    WITH RECURSIVE wanted(key) AS (
      SELECT LOWER(TRIM(value)) FROM json_each(${JSON.stringify(names)})
    ), ranked AS (
      SELECT climbs.id, climbs.area_id, climbs.name, climbs.type, climbs.grade,
             climbs.send_count, LOWER(TRIM(climbs.name)) AS key,
             ROW_NUMBER() OVER (
               PARTITION BY LOWER(TRIM(climbs.name))
               ORDER BY climbs.send_count DESC, climbs.id
             ) AS rn,
             COUNT(*) OVER (PARTITION BY LOWER(TRIM(climbs.name))) AS total
      FROM climbs
      WHERE LOWER(TRIM(climbs.name)) IN (SELECT key FROM wanted)
    ), matched AS (
      SELECT * FROM ranked WHERE rn <= ${CLIMB_CANDIDATES_PER_NAME}
    ), chain(climb_id, ancestor_id, dist) AS (
      SELECT matched.id, areas.parent_id, 1
      FROM matched
      JOIN areas ON areas.id = matched.area_id
      WHERE areas.parent_id IS NOT NULL
      UNION ALL
      SELECT chain.climb_id, areas.parent_id, chain.dist + 1
      FROM chain
      JOIN areas ON areas.id = chain.ancestor_id
      WHERE areas.parent_id IS NOT NULL
    )
    SELECT matched.id AS id, matched.key AS key, matched.name AS name,
           matched.type AS type, matched.grade AS grade,
           matched.area_id AS areaId, areas.name AS areaName,
           matched.send_count AS sendCount, matched.total AS total, (
      -- json_group_array keeps the order it receives rows in, so the ORDER
      -- BY belongs on the subquery it consumes (see searchAreas).
      SELECT json_group_array(json_object('id', a.id, 'name', a.name)) FROM (
        SELECT ancestor.id AS id, ancestor.name AS name
        FROM chain
        JOIN areas ancestor ON ancestor.id = chain.ancestor_id
        WHERE chain.climb_id = matched.id
        ORDER BY chain.dist DESC
      ) a
    ) AS ancestors
    FROM matched
    JOIN areas ON areas.id = matched.area_id
    ORDER BY matched.key, matched.rn
  `);

  return toCandidates(rows);
}

export type SearchClimbsParams = DisciplineGradeFilter &
  ClimbStatsFilter & {
    name?: string;
    areaName?: string;
    areaId?: number;
    sort?: SubtreeClimbsSort;
  };

export type ClimbWithAreaName = Pick<Climb, "id" | "areaId" | "name" | "type" | "grade"> & {
  areaName: string;
};

export const SEARCH_PAGE_SIZE = 25;

/** The ORDER BY every climb list shares, tie-breaks and id stabilizer included. */
export function climbListOrderBy(sort: SubtreeClimbsSort = "ascents_desc"): SQL {
  return sql`${SUBTREE_CLIMBS_ORDER_BY[sort]}, ${sortTieBreak(sort)}, climbs.id`;
}

/** A null result means no matchable FTS tokens; an empty array means no filters. */
export function searchClimbsConditions(params: SearchClimbsParams): SQL[] | null {
  const conditions: SQL[] = [];

  if (params.name) {
    const nameQuery = toFtsPrefixQuery(params.name);
    if (!nameQuery) return null;
    conditions.push(
      sql`climbs.id IN (SELECT rowid FROM climbs_fts WHERE climbs_fts MATCH ${nameQuery})`,
    );
  }

  const areaCondition =
    params.areaId !== undefined
      ? areaIdCondition(params.areaId)
      : areaNameCondition(params.areaName);
  if (areaCondition) conditions.push(areaCondition);

  const disciplineClauses = disciplineGradeConditions(params);
  if (disciplineClauses.length > 0) {
    conditions.push(sql`(${sql.join(disciplineClauses, sql` OR `)})`);
  }
  conditions.push(...climbStatsConditions(params));

  return conditions;
}

function searchClimbsWhereClause(conditions: SQL[]): SQL {
  return conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
}

export type SearchClimbsPage = { climbs: ClimbWithAreaName[]; hasNextPage: boolean };

export async function searchClimbs(
  db: Database,
  params: SearchClimbsParams,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
  offset = (page - 1) * pageSize,
): Promise<SearchClimbsPage> {
  const conditions = searchClimbsConditions(params);
  if (conditions === null) return { climbs: [], hasNextPage: false };

  // Raw SQL needs explicit aliases to return the camelCase fields expected by callers.
  const rows = await db.all<ClimbWithAreaName>(sql`
    SELECT
      climbs.id AS id,
      climbs.area_id AS areaId,
      climbs.name AS name,
      climbs.type AS type,
      climbs.grade AS grade,
      areas.name AS areaName
    FROM climbs
    JOIN areas ON areas.id = climbs.area_id
    ${searchClimbsWhereClause(conditions)}
    ORDER BY ${climbListOrderBy(params.sort)}
    LIMIT ${pageSize + 1}
    OFFSET ${offset}
  `);

  return {
    climbs: rows.slice(0, pageSize),
    hasNextPage: rows.length > pageSize,
  };
}

/** Skip this full count for unfiltered landing pages. The areas join is needed
 * only when areaNameCondition references the outer areas alias. */
export async function countSearchClimbs(db: Database, params: SearchClimbsParams): Promise<number> {
  const conditions = searchClimbsConditions(params);
  if (conditions === null) return 0;

  const areasJoin = params.areaName ? sql`JOIN areas ON areas.id = climbs.area_id` : sql``;
  const [row] = await db.all<{ count: number }>(sql`
    SELECT COUNT(*) AS count
    FROM climbs
    ${areasJoin}
    ${searchClimbsWhereClause(conditions)}
  `);
  return row?.count ?? 0;
}
