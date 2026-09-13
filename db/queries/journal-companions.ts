import { sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { CompanionOption } from "@/lib/journal-companions";

import { journalVisibleSql } from "./content-access";

/** Correlated only with already selected journal rows / final feed previews.
 * The partial index excludes arbitrarily many self-removal tombstones.
 * A tag is company on the author's entry, so it follows the author's audience,
 * not the companion's. An explicit `private` journal is the one opt-out, and it
 * withdraws the name from other readers only: never from the author, whose record
 * it is, nor the companion, who needs it to remove the tag. A private profile does
 * not hide the name here; it is a rule about the profile page, which authorizes its
 * own viewer, so the name links out like any other companion's. */
export function companionsJsonSql(viewerId: string | null, entryId: SQL): SQL {
  return sql`(SELECT json_group_array(json_object('id', companion.id, 'name', companion.name,
    'isSelf', json(CASE WHEN companion.id = ${viewerId} THEN 'true' ELSE 'false' END)))
    FROM journal_companions jc INDEXED BY journal_companions_active_idx
    JOIN journal_entries tagged_entry ON tagged_entry.id = jc.entry_id
    JOIN user companion ON companion.id = jc.user_id
    JOIN friendships tagged_friendship ON tagged_friendship.user_id = jc.friendship_user_id
      AND tagged_friendship.friend_id = jc.friendship_friend_id
    WHERE jc.entry_id = ${entryId} AND jc.suppressed = 0
      AND tagged_friendship.status = 'accepted'
      AND ${journalVisibleSql(viewerId, sql`tagged_entry.user_id`)}
      AND (tagged_entry.user_id = ${viewerId} OR companion.id = ${viewerId}
        OR companion.journal_visibility <> 'private')
  )`;
}

/** Any accepted friend is taggable: company is a fact about the session, not a
 * question about the friend's settings. */
export async function searchCompanionFriends(
  db: Database,
  ownerId: string,
  name: string,
): Promise<CompanionOption[]> {
  const query = name.trim().slice(0, 100);
  if (!query) return [];
  return db.all<CompanionOption>(sql`
    WITH friends AS (
      SELECT friend_id AS id FROM friendships WHERE user_id = ${ownerId} AND status = 'accepted'
      UNION ALL SELECT user_id AS id FROM friendships WHERE friend_id = ${ownerId} AND status = 'accepted'
    )
    SELECT u.id, u.name FROM friends f CROSS JOIN user u ON u.id = f.id
    WHERE substr(u.name, 1, length(${query})) = ${query} COLLATE NOCASE
    ORDER BY u.name COLLATE NOCASE, u.id LIMIT 20
  `);
}

/** Existing friends for the owner's journal filter, including private friends by name only. */
export async function getJournalFilterFriends(
  db: Database,
  ownerId: string,
): Promise<CompanionOption[]> {
  return db.all<CompanionOption>(sql`
    SELECT u.id, u.name FROM friendships f
    JOIN user u ON u.id = CASE WHEN f.user_id = ${ownerId} THEN f.friend_id ELSE f.user_id END
    WHERE (f.user_id = ${ownerId} OR f.friend_id = ${ownerId}) AND f.status = 'accepted'
    ORDER BY u.name COLLATE NOCASE, u.id
  `);
}
