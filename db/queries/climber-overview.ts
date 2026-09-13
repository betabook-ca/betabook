import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { journalVisibleSql } from "@/db/queries/content-access";
import { formatGrade, type ClimbType } from "@/lib/grades";

export type HardestSend = { type: ClimbType; grade: string };

export type ClimberOverview = {
  sendCount: number;
  areaCount: number;
  firstYear: number | null;
  /** Null when the viewer can't read the journal; recency then counts sending days. */
  daysOut: number | null;
  lastOut: string | null;
  daysThisMonth: number;
  /** "YYYY-MM" that `daysThisMonth` counts. */
  month: string;
};

type Totals = {
  sendCount: number;
  areaCount: number;
  firstSend: string | null;
  journalVisible: number;
  daysOut: number;
  firstEntry: string | null;
};

/** Graded disciplines only, most-sent first. The caller has already checked profile visibility. */
export async function getClimberHardest(db: Database, userId: string): Promise<HardestSend[]> {
  const rows = await db.all<{ type: ClimbType; maxGrade: number | null }>(sql`
    SELECT climbs.type AS type, MAX(climbs.grade) AS maxGrade
    FROM sends
    JOIN climbs ON climbs.id = sends.climb_id
    WHERE sends.user_id = ${userId}
    GROUP BY climbs.type
    ORDER BY COUNT(*) DESC, climbs.type
  `);
  return rows.flatMap(({ type, maxGrade }) =>
    maxGrade == null ? [] : [{ type, grade: formatGrade(type, maxGrade) }],
  );
}

/** Send facts follow profile visibility, which the caller has already checked. */
export async function getClimberOverview(
  db: Database,
  userId: string,
  viewerId: string,
  today: string,
): Promise<ClimberOverview> {
  const month = today.slice(0, 7);
  // Each statement reads the audience itself, so a stale page can't widen it.
  const access = sql`WITH access AS (SELECT ${journalVisibleSql(viewerId, sql`${userId}`)} AS visible)`;

  const [totals, recency] = await Promise.all([
    db.get<Totals>(sql`
      ${access}
      SELECT
        (SELECT COUNT(*) FROM sends WHERE user_id = ${userId}) AS sendCount,
        (SELECT COUNT(DISTINCT climbs.area_id) FROM sends
          JOIN climbs ON climbs.id = sends.climb_id
          WHERE sends.user_id = ${userId}) AS areaCount,
        (SELECT MIN(date_sent) FROM sends WHERE user_id = ${userId}) AS firstSend,
        (SELECT visible FROM access) AS journalVisible,
        (SELECT COUNT(DISTINCT entry_date) FROM journal_entries, access
          WHERE access.visible AND user_id = ${userId} AND kind = 'session') AS daysOut,
        (SELECT MIN(entry_date) FROM journal_entries, access
          WHERE access.visible AND user_id = ${userId}) AS firstEntry
    `),
    db.get<{ lastOut: string | null; daysThisMonth: number }>(sql`
      ${access}
      SELECT MAX(day) AS lastOut, COUNT(*) FILTER (WHERE day LIKE ${`${month}-%`}) AS daysThisMonth
      FROM (
        SELECT entry_date AS day FROM journal_entries, access
        WHERE access.visible AND user_id = ${userId} AND kind = 'session'
        UNION
        SELECT date_sent FROM sends, access
        WHERE NOT access.visible AND user_id = ${userId} AND date_sent IS NOT NULL
      )
    `),
  ]);

  const journalVisible = totals?.journalVisible === 1;
  const firstDate = [totals?.firstSend, totals?.firstEntry]
    .filter((date): date is string => Boolean(date))
    .sort()[0];

  return {
    sendCount: totals?.sendCount ?? 0,
    areaCount: totals?.areaCount ?? 0,
    firstYear: firstDate ? Number(firstDate.slice(0, 4)) : null,
    daysOut: journalVisible ? (totals?.daysOut ?? 0) : null,
    lastOut: recency?.lastOut ?? null,
    daysThisMonth: recency?.daysThisMonth ?? 0,
    month,
  };
}
