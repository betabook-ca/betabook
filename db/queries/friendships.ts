import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { friendshipPair, type FriendshipStatus } from "@/lib/friendships";

export type ClimberRow = {
  id: string;
  name: string;
  image: string | null;
  friendshipStatus: FriendshipStatus;
};
export type ClimbersPage = { climbers: ClimberRow[]; hasMore: boolean };
export type FriendRow = ClimberRow & { isPrivate: boolean };
export type FriendsPage = { friends: FriendRow[]; hasMore: boolean };

export async function getFriendship(
  db: Database,
  viewerId: string | null,
  targetId: string,
): Promise<FriendshipStatus> {
  if (!viewerId || viewerId === targetId) return "none";
  const pair = friendshipPair(viewerId, targetId);
  const row = await db.get<{ status: string; requestedBy: string }>(sql`
    SELECT status, requested_by AS requestedBy FROM friendships
    WHERE user_id = ${pair.userId} AND friend_id = ${pair.friendId}
  `);
  return !row
    ? "none"
    : row.status === "accepted"
      ? "friends"
      : row.requestedBy === viewerId
        ? "outgoing"
        : "incoming";
}

export async function getClimbersPage(
  db: Database,
  viewerId: string | null,
  {
    name = "",
    offset = 0,
    pageSize = 20,
  }: { name?: string; offset?: number; pageSize?: number } = {},
): Promise<ClimbersPage> {
  const query = name.trim().slice(0, 100);
  if (!query) return { climbers: [], hasMore: false };
  const limit = Number.isInteger(pageSize) ? Math.min(50, Math.max(1, pageSize)) : 20;
  const start = Number.isInteger(offset) ? Math.min(10000, Math.max(0, offset)) : 0;
  const prefix = `${query.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db.all<ClimberRow>(sql`
    SELECT u.id, u.name, u.image,
      CASE WHEN f.status = 'accepted' THEN 'friends' WHEN f.requested_by = ${viewerId} THEN 'outgoing'
        WHEN f.status = 'pending' THEN 'incoming' ELSE 'none' END AS friendshipStatus
    FROM user u LEFT JOIN friendships f ON f.user_id = min(u.id, ${viewerId}) AND f.friend_id = max(u.id, ${viewerId})
    WHERE u.is_private = 0 AND (${viewerId} IS NULL OR u.id <> ${viewerId}) AND u.name LIKE ${prefix} ESCAPE '\\'
    ORDER BY (u.name = ${query} COLLATE NOCASE) DESC, u.name COLLATE NOCASE, u.id
    LIMIT ${limit + 1} OFFSET ${start}
  `);
  return { climbers: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function getFriendsPage(
  db: Database,
  viewerId: string,
  requestsOnly = false,
  offset = 0,
): Promise<FriendsPage> {
  const start = Number.isInteger(offset) ? Math.min(10000, Math.max(0, offset)) : 0;
  const rows = await db.all<Omit<FriendRow, "isPrivate"> & { isPrivate: number }>(sql`
    SELECT u.id, u.name, u.image, u.is_private AS isPrivate,
      CASE WHEN f.status = 'accepted' THEN 'friends' WHEN f.requested_by = ${viewerId} THEN 'outgoing' ELSE 'incoming' END AS friendshipStatus
    FROM friendships f JOIN user u ON u.id = CASE WHEN f.user_id = ${viewerId} THEN f.friend_id ELSE f.user_id END
    WHERE (f.user_id = ${viewerId} OR f.friend_id = ${viewerId}) AND f.status = ${requestsOnly ? "pending" : "accepted"}
    ORDER BY f.created_at DESC, u.id DESC LIMIT 21 OFFSET ${start}
  `);
  return {
    friends: rows.slice(0, 20).map((row) => ({ ...row, isPrivate: row.isPrivate === 1 })),
    hasMore: rows.length > 20,
  };
}

export async function getPendingFriendRequestCount(
  db: Database,
  viewerId: string,
): Promise<number> {
  const row = await db.get<{ count: number }>(sql`
    SELECT count(*) AS count FROM friendships
    WHERE (user_id = ${viewerId} OR friend_id = ${viewerId}) AND requested_by <> ${viewerId} AND status = 'pending'
  `);
  return row?.count ?? 0;
}

export type SuggestedClimberRow = ClimberRow & { mutualFriendCount: number };

/** Friends of the viewer's accepted friends. Private profiles are never suggested and never
 * lend their connections, and only the count of friends in common leaves the query. */
export async function getClimberSuggestions(
  db: Database,
  viewerId: string,
  limit = 6,
): Promise<SuggestedClimberRow[]> {
  const count = Number.isInteger(limit) ? Math.min(20, Math.max(1, limit)) : 6;
  return db.all<SuggestedClimberRow>(sql`
    WITH friends AS (
      SELECT friend_id AS id FROM friendships WHERE user_id = ${viewerId} AND status = 'accepted'
      UNION ALL
      SELECT user_id FROM friendships WHERE friend_id = ${viewerId} AND status = 'accepted'
    ),
    via AS (SELECT friends.id FROM friends JOIN user u ON u.id = friends.id WHERE u.is_private = 0),
    reachable AS (
      SELECT f.friend_id AS id FROM via JOIN friendships f ON f.user_id = via.id AND f.status = 'accepted'
      UNION ALL
      SELECT f.user_id FROM via JOIN friendships f ON f.friend_id = via.id AND f.status = 'accepted'
    ),
    candidates AS (
      SELECT id, count(*) AS mutualFriendCount FROM reachable WHERE id <> ${viewerId} GROUP BY id
    )
    SELECT u.id, u.name, u.image, 'none' AS friendshipStatus, c.mutualFriendCount
    FROM candidates c JOIN user u ON u.id = c.id
    WHERE u.is_private = 0
      AND NOT EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.user_id = min(u.id, ${viewerId}) AND f.friend_id = max(u.id, ${viewerId})
      )
    ORDER BY c.mutualFriendCount DESC, u.name COLLATE NOCASE, u.id
    LIMIT ${count}
  `);
}
