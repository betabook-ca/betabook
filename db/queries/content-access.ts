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

/** Uses the same current permission predicate as the data query and metadata. */
export async function canReadJournal(db: Database, ownerId: string, viewerId: string | null) {
  const row = await db.get<{ visible: number }>(
    sql`SELECT ${journalVisibleSql(viewerId, sql`${ownerId}`)} AS visible`,
  );
  return row?.visible === 1;
}
