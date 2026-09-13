import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { HighlightSession } from "@/lib/analytics-highlights";

import { journalVisibleSql } from "./content-access";
import { journalHashtagsCondition } from "./hashtag-filter";
import { companionsJsonSql } from "./journal-companions";

export async function getAnalyticsHighlightSessions(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  tags: string[],
): Promise<HighlightSession[]> {
  const rows = await db.all<
    Omit<HighlightSession, "sent" | "isAscent" | "companions"> & {
      sent: number;
      isAscent: number;
      companions: string;
    }
  >(sql`
    SELECT j.id, j.entry_date AS entryDate, c.id AS climbId, c.name AS climbName,
      c.type AS climbType, j.sent, j.is_ascent AS isAscent,
      ${companionsJsonSql(viewerId, sql`j.id`)} AS companions
    FROM journal_entries j JOIN climbs c ON c.id = j.climb_id
    WHERE j.user_id = ${ownerId} AND j.kind = 'session'
      AND ${journalVisibleSql(viewerId, sql`j.user_id`)}
      ${tags.length ? sql`AND ${journalHashtagsCondition(tags, sql`j.tags`)}` : sql``}
    ORDER BY j.entry_date, j.id
  `);
  return rows.map((row) => ({
    ...row,
    sent: row.sent === 1,
    isAscent: row.isAscent === 1,
    companions: JSON.parse(row.companions) as HighlightSession["companions"],
  }));
}
