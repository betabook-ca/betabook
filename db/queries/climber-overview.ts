import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { journalVisibleSql } from "@/db/queries/content-access";
import { buildSeason, seasonRange, type SeasonWeek } from "@/lib/climber-season";
import { formatGrade, type ClimbType } from "@/lib/grades";

export type ClimberOverview = {
  sendCount: number;
  areaCount: number;
  /** Graded disciplines only, most-sent first. */
  hardest: { type: ClimbType; grade: string; sendCount: number }[];
  firstYear: number | null;
  /** Null when the viewer can't read the journal; the season then counts sending days. */
  daysOut: number | null;
  season: SeasonWeek[];
};

type Totals = {
  sendCount: number;
  areaCount: number;
  firstSend: string | null;
  journalVisible: number;
  daysOut: number;
  firstEntry: string | null;
};

type DisciplineRow = { type: ClimbType; sendCount: number; maxGrade: number | null };

/** Send facts follow profile visibility, which the caller has already checked. */
export async function getClimberOverview(
  db: Database,
  userId: string,
  viewerId: string,
  today: string,
): Promise<ClimberOverview> {
  const { from, to } = seasonRange(today);
  // Each statement reads the audience itself, so a stale page can't widen it.
  const access = sql`WITH access AS (SELECT ${journalVisibleSql(viewerId, sql`${userId}`)} AS visible)`;

  const [totals, disciplines, days] = await Promise.all([
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
    db.all<DisciplineRow>(sql`
      SELECT climbs.type AS type, COUNT(*) AS sendCount, MAX(climbs.grade) AS maxGrade
      FROM sends
      JOIN climbs ON climbs.id = sends.climb_id
      WHERE sends.user_id = ${userId}
      GROUP BY climbs.type
      ORDER BY sendCount DESC, climbs.type
    `),
    db.all<{ day: string }>(sql`
      ${access}
      SELECT entry_date AS day FROM journal_entries, access
      WHERE access.visible AND user_id = ${userId} AND kind = 'session'
        AND entry_date BETWEEN ${from} AND ${to}
      UNION
      SELECT date_sent FROM sends, access
      WHERE NOT access.visible AND user_id = ${userId}
        AND date_sent BETWEEN ${from} AND ${to}
    `),
  ]);

  const journalVisible = totals?.journalVisible === 1;
  const firstDate = [totals?.firstSend, totals?.firstEntry]
    .filter((date): date is string => Boolean(date))
    .sort()[0];

  return {
    sendCount: totals?.sendCount ?? 0,
    areaCount: totals?.areaCount ?? 0,
    hardest: disciplines.flatMap(({ type, sendCount, maxGrade }) =>
      maxGrade == null ? [] : [{ type, grade: formatGrade(type, maxGrade), sendCount }],
    ),
    firstYear: firstDate ? Number(firstDate.slice(0, 4)) : null,
    daysOut: journalVisible ? (totals?.daysOut ?? 0) : null,
    season: buildSeason(
      days.map((row) => row.day),
      today,
    ),
  };
}
