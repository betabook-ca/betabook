import { eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { areas, climbs } from "@/db/schema";
import {
  publicHasNextPage,
  type PublicArea,
  type PublicAreaDetails,
  type PublicAreaResult,
  type PublicClimb,
  type PublicClimbSend,
  type PublicClimbsPage,
  type PublicCatalogOptions,
} from "@/lib/public-catalog";

import { areaNameCondition, getAreaBreadcrumbs } from "./areas";
import { climbListOrderBy, searchClimbsConditions } from "./climbs";
import { sendCommentVisibleSql } from "./content-access";
import { toFtsPrefixQuery } from "./shared";

const PUBLIC_CLIMB_SENDS_LIMIT = 10;

/** Names, commentary and exact dates leave the database only for Everyone
 * commentary, which a private profile overrides. Send and user IDs never do:
 * sequential IDs would date anonymous rows. */
export async function getPublicSendsForClimb(
  db: Database,
  climbId: number,
): Promise<PublicClimbSend[]> {
  const named = sendCommentVisibleSql(null, sql`sends.user_id`);
  return db.all<PublicClimbSend>(sql`
    SELECT
      CASE WHEN ${named} THEN user.name END AS userName,
      CASE WHEN ${named} THEN sends.date_sent ELSE substr(sends.date_sent, 1, 7) END AS dateSent,
      sends.ascent_style AS ascentStyle,
      sends.rating AS rating,
      sends.suggested_grade AS suggestedGrade,
      sends.grade_feel AS gradeFeel,
      CASE WHEN ${named} THEN sends.comment END AS comment
    FROM sends
    JOIN user ON user.id = sends.user_id
    WHERE sends.climb_id = ${climbId}
    ORDER BY sends.date_sent DESC, sends.id ASC
    LIMIT ${PUBLIC_CLIMB_SENDS_LIMIT}
  `);
}

const publicAreaColumns = { id: areas.id, name: areas.name, parentId: areas.parentId };
export async function getPublicArea(
  db: Database,
  id: number,
): Promise<PublicAreaDetails | undefined> {
  return db
    .select({ ...publicAreaColumns, description: areas.description })
    .from(areas)
    .where(eq(areas.id, id))
    .get();
}
export async function getPublicClimb(db: Database, id: number): Promise<PublicClimb | undefined> {
  return db
    .select({
      id: climbs.id,
      name: climbs.name,
      areaId: climbs.areaId,
      areaName: areas.name,
      type: climbs.type,
      grade: climbs.grade,
      description: climbs.description,
      avgRating: climbs.avgRating,
      sendCount: climbs.sendCount,
    })
    .from(climbs)
    .innerJoin(areas, eq(areas.id, climbs.areaId))
    .where(eq(climbs.id, id))
    .get();
}
export async function getPublicAncestors(db: Database, area: PublicArea): Promise<PublicArea[]> {
  return db.all<PublicArea>(sql`
    WITH RECURSIVE chain(id, depth) AS (
      SELECT parent_id, 0 FROM areas WHERE id = ${area.id} AND parent_id IS NOT NULL
      UNION ALL
      SELECT areas.parent_id, chain.depth + 1 FROM areas JOIN chain ON chain.id = areas.id WHERE areas.parent_id IS NOT NULL
    ) SELECT areas.id, areas.name, areas.parent_id AS parentId FROM areas JOIN chain ON chain.id = areas.id ORDER BY chain.depth DESC
  `);
}
export async function getPublicSubareas(db: Database, id: number): Promise<PublicArea[]> {
  const rows = await db.select(publicAreaColumns).from(areas).where(eq(areas.parentId, id));
  return rows.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
}
export async function resolvePublicSubarea(
  db: Database,
  area: PublicArea,
  candidate: number | null,
): Promise<PublicArea> {
  if (candidate === null || candidate === area.id) return area;
  const subarea = await getPublicArea(db, candidate);
  return subarea &&
    (await getPublicAncestors(db, subarea)).some((ancestor) => ancestor.id === area.id)
    ? subarea
    : area;
}

export async function searchPublicAreas(
  db: Database,
  options: PublicCatalogOptions,
): Promise<{ areas: PublicAreaResult[]; hasNextPage: boolean }> {
  const query = toFtsPrefixQuery(options.name);
  if (!query || options.offset === null) return { areas: [], hasNextPage: false };
  const scope =
    options.areaId !== undefined
      ? sql`areas.id IN (
          WITH RECURSIVE subtree(id) AS (
            SELECT id FROM areas WHERE id = ${options.areaId}
            UNION ALL
            SELECT child.id FROM areas child JOIN subtree ON child.parent_id = subtree.id
          ) SELECT id FROM subtree
        )`
      : areaNameCondition(options.areaName);
  const rows = await db.all<PublicAreaDetails>(sql`
    SELECT areas.id, areas.name, areas.parent_id AS parentId, areas.description FROM areas
    WHERE areas.id IN (SELECT rowid FROM areas_fts WHERE areas_fts MATCH ${query})
    ${scope ? sql`AND ${scope}` : sql``}
    ORDER BY areas.name ${options.sort === "name_desc" ? sql`DESC` : sql`ASC`}, areas.id
    LIMIT ${options.pageSize + 1} OFFSET ${options.offset}
  `);
  const visible = rows.slice(0, options.pageSize);
  const breadcrumbs = await getAreaBreadcrumbs(
    db,
    visible.map((area) => area.id),
    1000,
  );
  return {
    areas: visible.map((area) => ({
      ...area,
      ancestorPath: (breadcrumbs[area.id] ?? []).map((a) => a.name).join(" > ") || null,
    })),
    hasNextPage: publicHasNextPage(rows.length, options),
  };
}

export async function searchPublicClimbs(
  db: Database,
  options: PublicCatalogOptions,
): Promise<PublicClimbsPage> {
  const empty = { climbs: [], areaBreadcrumbs: {}, hasNextPage: false };
  if (options.offset === null) return empty;
  const conditions = searchClimbsConditions(options);
  if (conditions === null) return empty;
  const rows = await db.all<PublicClimb>(sql`
    SELECT climbs.id, climbs.name, climbs.area_id AS areaId, areas.name AS areaName,
      climbs.type, climbs.grade, climbs.description,
      climbs.avg_rating AS avgRating, climbs.send_count AS sendCount
    FROM climbs JOIN areas ON areas.id = climbs.area_id
    ${conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``}
    ORDER BY ${climbListOrderBy(options.sort)}
    LIMIT ${options.pageSize + 1} OFFSET ${options.offset}
  `);
  const visible = rows.slice(0, options.pageSize);
  return {
    climbs: visible,
    areaBreadcrumbs: await getAreaBreadcrumbs(
      db,
      visible.map((climb) => climb.areaId),
    ),
    hasNextPage: publicHasNextPage(rows.length, options),
  };
}
