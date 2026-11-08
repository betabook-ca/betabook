import { sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { ClimbListView } from "@/lib/climb-lists";

import { getClimbListItemsWhere, type ClimbListItem, type ClimbListSummary } from "./climb-lists";

/** What a live link resolves to. The share dialog promises "the list's name,
 * description, climbs and grades, and your name", and that sentence is the
 * consent this page rests on, so nothing beyond it may be added here. */
type SharedClimbList = {
  owner: { id: string; name: string; image: string | null };
  list: ClimbListSummary;
};

/** `hidden` covers "no such token", "the list is gone" and "the owner went
 * private" alike. An expired link names its owner and list so the page can
 * send the owner to renew it; the page shows neither to anyone else. */
type SharedClimbListAccess =
  | { status: "hidden"; shared?: undefined }
  | { status: "expired"; shared?: undefined; ownerId: string; listId: number }
  | { status: "visible"; shared: SharedClimbList };

/** What makes a link readable, over an aliased `link` row and its owner
 * `share_owner`. There is no viewer in it: holding the URL is the permission.
 * The owner's lists audience is deliberately absent too — a link opens its
 * list even when that is Only me. The private check backs up the trigger in
 * migration 0057 for a link written while the profile was closing. */
const readableSql = sql`
  share_owner.is_private = 0
  AND (link.expires_at IS NULL OR link.expires_at > datetime('now'))
`;

/** The list join ties a link to a list that still exists, so correctness
 * never rests on foreign keys being enforced. */
const shareFromSql = sql`
  FROM climb_list_share_links link
  JOIN climb_lists l ON l.id = link.list_id AND l.user_id = link.user_id
  JOIN user share_owner ON share_owner.id = link.user_id
`;

/** True when `token` is a live link to the aliased list `l`. Every read of a
 * shared list's rows puts this in its WHERE. */
export function climbListLinkCoversSql(token: string): SQL {
  return sql`EXISTS (
    SELECT 1 FROM climb_list_share_links link
    JOIN user share_owner ON share_owner.id = link.user_id
    WHERE link.token = ${token} AND link.list_id = l.id AND link.user_id = l.user_id
      AND ${readableSql}
  )`;
}

type SharedRow = ClimbListSummary & {
  readable: number;
  ownerIsPrivate: number;
  ownerId: string;
  ownerName: string;
  ownerImage: string | null;
};

/** The shared list, and whether the link resolves at all, in one read. The
 * owner and list come from the token row, never from a route, which is what
 * keeps a link to the one list it was made for. */
export async function getSharedClimbList(
  db: Database,
  token: string,
): Promise<SharedClimbListAccess> {
  const row = await db.get<SharedRow>(sql`
    SELECT
      ${readableSql}         AS readable,
      share_owner.is_private AS ownerIsPrivate,
      share_owner.id         AS ownerId,
      share_owner.name       AS ownerName,
      share_owner.image      AS ownerImage,
      l.id                   AS id,
      l.title                AS title,
      l.description          AS description,
      (SELECT COUNT(*) FROM climb_list_items i WHERE i.list_id = l.id) AS climbCount,
      l.updated_at           AS updatedAt
    ${shareFromSql}
    WHERE link.token = ${token}
  `);

  if (!row) return { status: "hidden" };
  if (row.readable !== 1) {
    return row.ownerIsPrivate === 1
      ? { status: "hidden" }
      : { status: "expired", ownerId: row.ownerId, listId: row.id };
  }
  const {
    readable: _readable,
    ownerIsPrivate: _ownerIsPrivate,
    ownerId,
    ownerName,
    ownerImage,
    ...list
  } = row;
  return {
    status: "visible",
    shared: { owner: { id: ownerId, name: ownerName, image: ownerImage }, list },
  };
}

/** The climbs on a shared list, checked against the link in the same
 * statement. A signed-in reader still sees their own sent state; a signed-out
 * one sees none. */
export function getSharedClimbListItems(
  db: Database,
  token: string,
  viewerId: string | null,
  view: ClimbListView,
): Promise<ClimbListItem[]> {
  return getClimbListItemsWhere(db, climbListLinkCoversSql(token), viewerId, view);
}

/** The owner's own view of a list's live link, for the Share dialog. Scoped
 * to the owner: this is the only read that hands out a token. An expired link
 * reads as none, so sharing again makes a new token. */
export async function getClimbListShareForOwner(
  db: Database,
  ownerId: string,
  listId: number,
): Promise<{ token: string; expiresAt: string | null } | null> {
  const row = await db.get<{ token: string; expiresAt: string | null }>(sql`
    SELECT token, expires_at AS expiresAt
    FROM climb_list_share_links WHERE user_id = ${ownerId} AND list_id = ${listId}
      AND (expires_at IS NULL OR expires_at > datetime('now'))
  `);
  return row ?? null;
}
