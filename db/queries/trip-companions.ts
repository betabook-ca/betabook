import { sql, type SQL } from "drizzle-orm";

import { journalVisibleSql } from "./content-access";

/** `companionsJsonSql` over a trip: a tag follows the trip owner's journal
 * audience, not the friend's own settings, and is gone once its friend removes
 * it or the friendship ends. */
export function tripCompanionsJsonSql(viewerId: string | null, tripId: SQL): SQL {
  return sql`(SELECT json_group_array(json_object('id', companion.id, 'name', companion.name,
    'image', companion.image,
    'isSelf', json(CASE WHEN companion.id = ${viewerId} THEN 'true' ELSE 'false' END)))
    FROM trip_companions tc INDEXED BY trip_companions_active_idx
    JOIN trips tagged_trip ON tagged_trip.id = tc.trip_id
    JOIN user companion ON companion.id = tc.user_id
    JOIN friendships tagged_friendship ON tagged_friendship.user_id = tc.friendship_user_id
      AND tagged_friendship.friend_id = tc.friendship_friend_id
    WHERE tc.trip_id = ${tripId} AND tc.suppressed = 0
      AND tagged_friendship.status = 'accepted'
      AND ${journalVisibleSql(viewerId, sql`tagged_trip.user_id`)}
  )`;
}
