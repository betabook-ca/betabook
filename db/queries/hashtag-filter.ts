import { sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";

import { journalVisibleSql } from "./content-access";

/** JSON binds keep multi-tag matching within D1 parameter and expression limits. */
export function journalHashtagsCondition(tags: readonly string[], column: SQL): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM json_each(${JSON.stringify(tags)}) requested_tag
    WHERE NOT EXISTS (
      SELECT 1 FROM json_each(${column}) actual_tag WHERE actual_tag.value = requested_tag.value
    )
  )`;
}

/** Only the original ascent tags describe a send; repeats cannot tag it retroactively. */
export function sendHashtagCondition(tags: readonly string[], viewerId: string | null) {
  return sql`EXISTS (
    SELECT 1 FROM journal_entries tagged_ascent
    WHERE tagged_ascent.user_id = sends.user_id AND tagged_ascent.climb_id = sends.climb_id
      AND tagged_ascent.is_ascent = 1 AND ${journalHashtagsCondition(tags, sql`tagged_ascent.tags`)}
      AND ${journalVisibleSql(viewerId, sql`tagged_ascent.user_id`)}
  )`;
}

export async function getUserHashtags(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  ascentsOnly = false,
  includeTraining = false,
): Promise<string[]> {
  const rows = await db.all<{ tag: string }>(sql`
    SELECT DISTINCT tag.value AS tag
    FROM journal_entries j, json_each(j.tags) tag
    WHERE j.user_id = ${ownerId}
      ${includeTraining ? sql`` : sql`AND j.kind = 'session'`}
      AND ${journalVisibleSql(viewerId, sql`j.user_id`)}
      ${ascentsOnly ? sql`AND j.is_ascent = 1` : sql``}
    ORDER BY tag.value
  `);
  return rows.map((row) => row.tag);
}
