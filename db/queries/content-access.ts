import { sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
/** Keep permission checks inside the read statement: revocation and audience
 * changes must affect notes, counts and pagination even with stale page props.
 * 'everyone', which only send commentary can store, is the one audience that
 * reaches a signed-out (null) viewer. */
function contentVisibleSql(viewerId: string | null, authorId: SQL, audience: SQL): SQL {
  return sql`EXISTS (
    SELECT 1 FROM user content_owner
    WHERE content_owner.id = ${authorId} AND (
      content_owner.id = ${viewerId} OR (content_owner.is_private = 0 AND (
        ${audience} = 'everyone' OR (${viewerId} IS NOT NULL AND (
          ${audience} = 'public' OR (
            ${audience} = 'friends' AND EXISTS (
              SELECT 1 FROM friendships WHERE user_id = min(content_owner.id, ${viewerId})
                AND friend_id = max(content_owner.id, ${viewerId}) AND status = 'accepted'
            )
          )
        ))
      ))
    )
  )`;
}

export function journalVisibleSql(viewerId: string | null, authorId: SQL): SQL {
  return contentVisibleSql(viewerId, authorId, sql`content_owner.journal_visibility`);
}

export function sendCommentVisibleSql(viewerId: string | null, authorId: SQL): SQL {
  return contentVisibleSql(viewerId, authorId, sql`content_owner.send_comment_visibility`);
}

/** The other party of each friendship row `userId` is on, from either side of
 * the ordered pair. Each arm carries its own status filter so the pair primary
 * key and friendships_friend_idx serve their direction. */
function friendshipCounterpartsSql(
  userId: SQL | string,
  status: "accepted" | "pending",
  columns: SQL,
): SQL {
  return sql`SELECT friend_id AS id${columns} FROM friendships WHERE user_id = ${userId} AND status = ${status}
    UNION ALL SELECT user_id${columns} FROM friendships WHERE friend_id = ${userId} AND status = ${status}`;
}

/** Who counts as a friend of `userId`: only an accepted row, since a pending
 * request grants no access. The body of every `friends` CTE. */
export function acceptedFriendIdsSql(userId: SQL | string): SQL {
  return friendshipCounterpartsSql(userId, "accepted", sql``);
}

/** Open requests in both directions, with the columns that label and order them. */
export function pendingFriendRequestsSql(userId: SQL | string): SQL {
  return friendshipCounterpartsSql(userId, "pending", sql`, requested_by, created_at`);
}

/** Uses the same current permission predicate as the data query and metadata. */
export async function canReadJournal(db: Database, ownerId: string, viewerId: string | null) {
  const row = await db.get<{ visible: number }>(
    sql`SELECT ${journalVisibleSql(viewerId, sql`${ownerId}`)} AS visible`,
  );
  return row?.visible === 1;
}
