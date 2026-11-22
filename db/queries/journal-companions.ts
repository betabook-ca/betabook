import { sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { CompanionOption } from "@/lib/journal-companions";

import { acceptedFriendIdsSql, journalVisibleSql } from "./content-access";

/** Where each kind of tag lives. The aliases differ per kind and are kept
 * distinct from anything a caller correlates on, since the tagged row id is
 * an outer reference into this subquery. */
const COMPANION_TAGS = {
  entry: {
    tags: sql.raw("journal_companions jc INDEXED BY journal_companions_active_idx"),
    tag: sql.raw("jc"),
    tagged: sql.raw("journal_entries tagged_entry ON tagged_entry.id = jc.entry_id"),
    taggedId: sql.raw("jc.entry_id"),
    author: sql`tagged_entry.user_id`,
  },
  trip: {
    tags: sql.raw("trip_companions tc INDEXED BY trip_companions_active_idx"),
    tag: sql.raw("tc"),
    tagged: sql.raw("trips tagged_trip ON tagged_trip.id = tc.trip_id"),
    taggedId: sql.raw("tc.trip_id"),
    author: sql`tagged_trip.user_id`,
  },
};

/** The one companion-tag builder, for journal entries and trips alike: a JSON
 * array of the friends tagged on row `taggedId`, shown to anyone who can read
 * the author's journal. A tag is hidden after the friend removes it
 * (`suppressed`) or the friendship ends. The partial index excludes
 * arbitrarily many self-removal tombstones. */
export function companionTagsJsonSql(
  kind: keyof typeof COMPANION_TAGS,
  viewerId: string | null,
  taggedId: SQL,
): SQL {
  const source = COMPANION_TAGS[kind];
  return sql`(SELECT json_group_array(json_object('id', companion.id, 'name', companion.name,
    'image', companion.image,
    'isSelf', json(CASE WHEN companion.id = ${viewerId} THEN 'true' ELSE 'false' END)))
    FROM ${source.tags}
    JOIN ${source.tagged}
    JOIN user companion ON companion.id = ${source.tag}.user_id
    JOIN friendships tagged_friendship ON tagged_friendship.user_id = ${source.tag}.friendship_user_id
      AND tagged_friendship.friend_id = ${source.tag}.friendship_friend_id
    WHERE ${source.taggedId} = ${taggedId} AND ${source.tag}.suppressed = 0
      AND tagged_friendship.status = 'accepted'
      AND ${journalVisibleSql(viewerId, source.author)}
  )`;
}

/** Correlated only with already selected journal rows / final feed previews.
 * A tag is company on the author's entry, so it follows the author's audience,
 * not the companion's journal or profile settings. A companion's profile page
 * still authorizes its own viewer when the name is followed as a link. */
export function companionsJsonSql(viewerId: string | null, entryId: SQL): SQL {
  return companionTagsJsonSql("entry", viewerId, entryId);
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
    WITH friends AS (${acceptedFriendIdsSql(ownerId)})
    SELECT u.id, u.name, u.image FROM friends f CROSS JOIN user u ON u.id = f.id
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
    WITH friends AS (${acceptedFriendIdsSql(ownerId)})
    SELECT u.id, u.name, u.image FROM friends f CROSS JOIN user u ON u.id = f.id
    ORDER BY u.name COLLATE NOCASE, u.id
  `);
}
