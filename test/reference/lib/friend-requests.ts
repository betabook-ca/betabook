import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { friendshipPair } from "@/lib/friendships";

/** A pending request from `requesterId`, never to a private profile and never
 * over an existing pair. True only for the insert winner, the one caller that
 * may send the notification. */
export async function insertFriendRequest(db: Database, requesterId: string, targetId: string) {
  const pair = friendshipPair(requesterId, targetId);
  const inserted = await db.get(sql`
    INSERT INTO friendships (user_id, friend_id, requested_by)
    SELECT ${pair.userId}, ${pair.friendId}, ${requesterId} FROM user WHERE id = ${targetId} AND is_private = 0
    ON CONFLICT (user_id, friend_id) DO NOTHING
    RETURNING user_id
  `);
  return Boolean(inserted);
}
