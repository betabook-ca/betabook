import { sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import type {
  YearAreaMap,
  YearCompanion,
  YearSendRow,
  YearSessionRow,
  YearTripRow,
} from "@/lib/year-in-review";

import { ancestorChainCte } from "./area-tree";
import { companionsJsonSql } from "./journal-companions";
import { yearLinkCoversSql } from "./year-review-shares";

/** Whose recap is read, and through what. The owner reads their own rows; a
 * link reads the same rows, but every statement re-checks the token, so a
 * link revoked between two reads gets nothing from the second. */
export type YearReviewScope = { ownerId: string; token?: string };

function coveredSql(scope: YearReviewScope, ownerColumn: SQL): SQL {
  return scope.token ? yearLinkCoversSql(scope.token, ownerColumn) : sql`1 = 1`;
}

export type YearReviewData = {
  sends: YearSendRow[];
  sessions: YearSessionRow[];
  trips: YearTripRow[];
  areas: YearAreaMap;
};

/** All-time sends: new grades, new climbs and trips look back before the year. */
async function getYearSends(db: Database, scope: YearReviewScope): Promise<YearSendRow[]> {
  return db.all<YearSendRow>(sql`
    SELECT s.climb_id AS climbId, c.name AS climbName, c.type AS climbType,
      s.suggested_grade AS grade, c.area_id AS areaId, s.ascent_style AS ascentStyle,
      s.date_sent AS dateSent, s.rating, s.comment,
      c.rating_sum AS ratingSum, c.rating_count AS ratingCount
    FROM sends s JOIN climbs c ON c.id = s.climb_id
    WHERE s.user_id = ${scope.ownerId} AND ${coveredSql(scope, sql`s.user_id`)}
    ORDER BY s.date_sent, s.id
  `);
}

/** All-time climb sessions. Companion tags are read only for the requested
 * year's entries, since nothing else uses them. */
async function getYearSessions(
  db: Database,
  scope: YearReviewScope,
  year: number,
): Promise<YearSessionRow[]> {
  const rows = await db.all<
    Omit<YearSessionRow, "sent" | "isAscent" | "companions"> & {
      sent: number;
      isAscent: number;
      companions: string | null;
    }
  >(sql`
    SELECT j.id, j.climb_id AS climbId, c.name AS climbName, c.type AS climbType,
      c.grade AS climbGrade, c.area_id AS areaId, j.entry_date AS entryDate,
      j.sent, j.is_ascent AS isAscent,
      CASE WHEN substr(j.entry_date, 1, 4) = ${String(year)}
        THEN ${companionsJsonSql(scope.ownerId, sql`j.id`)} END AS companions
    FROM journal_entries j JOIN climbs c ON c.id = j.climb_id
    WHERE j.user_id = ${scope.ownerId} AND j.kind = 'session'
      AND ${coveredSql(scope, sql`j.user_id`)}
    ORDER BY j.entry_date, j.id
  `);
  return rows.map((row) => ({
    ...row,
    sent: row.sent === 1,
    isAscent: row.isAscent === 1,
    companions: row.companions
      ? (JSON.parse(row.companions) as (YearCompanion & { isSelf: boolean })[]).map(
          ({ id, name, image }) => ({ id, name, image }),
        )
      : [],
  }));
}

async function getYearTrips(db: Database, scope: YearReviewScope): Promise<YearTripRow[]> {
  return db.all<YearTripRow>(sql`
    SELECT t.id, t.name, t.start_date AS startDate, t.end_date AS endDate
    FROM trips t
    WHERE t.user_id = ${scope.ownerId} AND ${coveredSql(scope, sql`t.user_id`)}
    ORDER BY t.start_date, t.id
  `);
}

/** Root-first paths, with names, for every area holding one of the owner's
 * climbs. One statement and one reference to the ancestor chain, which keeps
 * it inside D1's CTE expansion limit; names come back in the same rows
 * because an IN list of area ids could pass D1's 100-parameter limit. */
async function getYearAreas(db: Database, scope: YearReviewScope): Promise<YearAreaMap> {
  const targets = sql.raw("targets");
  const rows = await db.all<{
    areaId: number;
    areaName: string;
    ancestorId: number | null;
    ancestorName: string | null;
    dist: number | null;
  }>(sql`
    WITH RECURSIVE targets(area_id) AS (
      SELECT c.area_id FROM sends s JOIN climbs c ON c.id = s.climb_id
      WHERE s.user_id = ${scope.ownerId} AND ${coveredSql(scope, sql`s.user_id`)}
      UNION
      SELECT c.area_id FROM journal_entries j JOIN climbs c ON c.id = j.climb_id
      WHERE j.user_id = ${scope.ownerId} AND ${coveredSql(scope, sql`j.user_id`)}
    ),
    ${ancestorChainCte(targets)}
    SELECT t.area_id AS areaId, self.name AS areaName,
      chain.ancestor_id AS ancestorId, ancestor.name AS ancestorName, chain.dist AS dist
    FROM targets t
    JOIN areas self ON self.id = t.area_id
    LEFT JOIN ancestor_chain chain ON chain.area_id = t.area_id
    LEFT JOIN areas ancestor ON ancestor.id = chain.ancestor_id
  `);
  const names = new Map<number, string>();
  const chains = new Map<number, { id: number; dist: number }[]>();
  for (const row of rows) {
    names.set(row.areaId, row.areaName);
    const chain = chains.get(row.areaId) ?? [];
    if (row.ancestorId != null && row.dist != null) {
      chain.push({ id: row.ancestorId, dist: row.dist });
      names.set(row.ancestorId, row.ancestorName ?? "");
    }
    chains.set(row.areaId, chain);
  }
  const areas = new Map<number, { name: string; path: number[] }>();
  for (const [areaId, chain] of chains) {
    const ancestors = chain.toSorted((a, b) => b.dist - a.dist).map(({ id }) => id);
    const path = [...ancestors, areaId];
    areas.set(areaId, { name: names.get(areaId) ?? "", path });
    // Every ancestor gets its own (shorter) path, so a common ancestor can
    // be printed and placed too.
    for (const [index, id] of ancestors.entries()) {
      if (!areas.has(id))
        areas.set(id, { name: names.get(id) ?? "", path: path.slice(0, index + 1) });
    }
  }
  return areas;
}

/** Everything `buildYearInReview` reads, for the owner's page or a link. */
export async function getYearReviewData(
  db: Database,
  scope: YearReviewScope,
  year: number,
): Promise<YearReviewData> {
  const [sends, sessions, trips, areas] = await Promise.all([
    getYearSends(db, scope),
    getYearSessions(db, scope, year),
    getYearTrips(db, scope),
    getYearAreas(db, scope),
  ]);
  return {
    sends,
    sessions,
    trips,
    areas,
  };
}

/** The banner and journal card's cheap check: whether the year has any days
 * out or dated sends. Not the full builder. */
export async function getYearReviewStatus(
  db: Database,
  ownerId: string,
  year: number,
): Promise<{ active: boolean; daysOut: number; sends: number }> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const row = await db.get<{ daysOut: number; sends: number }>(sql`
    SELECT
      (SELECT COUNT(*) FROM (
        SELECT entry_date AS day FROM journal_entries
        WHERE user_id = ${ownerId} AND kind = 'session' AND entry_date BETWEEN ${from} AND ${to}
        UNION
        SELECT date_sent FROM sends
        WHERE user_id = ${ownerId} AND date_sent BETWEEN ${from} AND ${to}
      )) AS daysOut,
      (SELECT COUNT(*) FROM sends
        WHERE user_id = ${ownerId} AND date_sent BETWEEN ${from} AND ${to}) AS sends
  `);
  const daysOut = row?.daysOut ?? 0;
  const sends = row?.sends ?? 0;
  return { active: daysOut > 0 || sends > 0, daysOut, sends };
}
