import { sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";

import { tripEntryRowsSql, tripSendRowsSql, type TripSummary } from "./trips";

/** What a valid link resolves to: the trip as its owner's own page shows it.
 *
 * The share dialog says "this trip's notes, photos, journal entries, sends and
 * analytics" before the link exists, and that sentence is the consent this
 * page rests on, so anything added here has to stay inside what it already
 * covers. One thing the owner's page carries does not travel: tagged friends.
 * They agreed to appear on the owner's trips and journal, not to be named to
 * whoever holds a link, and they never saw the dialog. `companions` is
 * therefore always empty. */
export type SharedTrip = {
  owner: { id: string; name: string; image: string | null };
  trip: TripSummary;
  notes: string | null;
};

/** Why a link did not resolve. `hidden` covers "no such token", "the trip is
 * gone" and "the owner went private" alike: a reader is never told which. An
 * expired link names its owner and trip so the page can send the owner to
 * their trip to renew it; the page never shows either to anyone else. */
export type SharedTripAccess =
  | { status: "hidden"; shared?: undefined }
  | { status: "expired"; shared?: undefined; ownerId: string; tripId: number }
  | { status: "visible"; shared: SharedTrip };

/**
 * What makes a link readable, as conditions over an aliased `link` row and its
 * owner `share_owner`.
 *
 * There is no viewer in it, and that is the design: a trip link carries no
 * audience, so holding the URL is the whole of the permission. What can still
 * revoke it lives here instead — the deadline passing, and the owner having
 * gone private. Both are read inside each statement rather than trusted from
 * page props, so a link stops answering on the next read.
 *
 * The private check is belt and braces: the trigger in migration 0050 deletes
 * every row when a profile closes. It covers the one case the trigger cannot —
 * a share written in the same moment the profile was closing.
 */
const readableSql = sql`
  share_owner.is_private = 0
  -- NULL > datetime('now') is NULL, not true, so the null branch is explicit.
  AND (link.expires_at IS NULL OR link.expires_at > datetime('now'))
`;

/** The trip join is what ties a link to a trip that still exists. The
 * composite foreign key already guarantees it, and the join is here anyway so
 * correctness never rests on foreign keys being enforced. */
const shareFromSql = sql`
  FROM trip_share_links link
  JOIN trips t ON t.id = link.trip_id AND t.user_id = link.user_id
  JOIN user share_owner ON share_owner.id = link.user_id
`;

/** True when `token` is a live link to a trip of `ownerId` whose dates include
 * `date`. Every read of a shared trip's rows puts this in its WHERE, so the
 * link, its trip's current dates and its expiry are checked by the statement
 * that selects the rows: a link revoked or expired between two reads of one
 * page gets nothing from the second. An undated row never matches, since
 * `NULL BETWEEN …` is NULL.
 *
 * The dates are the trip's current ones on purpose. A link shares the trip,
 * not a snapshot of it: climbers expect it to follow the trip as it changes,
 * including when they move or extend its dates. */
export function tripLinkCoversSql(token: string, ownerId: SQL, date: SQL): SQL {
  return sql`EXISTS (
    SELECT 1 ${shareFromSql}
    WHERE link.token = ${token} AND link.user_id = ${ownerId}
      AND ${date} BETWEEN t.start_date AND t.end_date
      AND ${readableSql}
  )`;
}

type SharedTripRow = Omit<TripSummary, "companions"> & {
  readable: number;
  ownerIsPrivate: number;
  ownerId: string;
  ownerName: string;
  ownerImage: string | null;
  notes: string | null;
};

/** The shared trip, and whether the link resolves at all, in one read.
 *
 * Deriving the owner and the trip from the token row — never from a route — is
 * what keeps a link reachable to only the one trip it was made for. The counts
 * use the same fragments as the owner's trip card, so the page reports the
 * owner's numbers. They and the notes are computed only when the link is
 * readable; a dead link reads just enough to tell an expiry from a closed
 * profile. */
export async function getSharedTrip(db: Database, token: string): Promise<SharedTripAccess> {
  const row = await db.get<SharedTripRow>(sql`
    SELECT
      ${readableSql}         AS readable,
      share_owner.is_private AS ownerIsPrivate,
      share_owner.id         AS ownerId,
      share_owner.name       AS ownerName,
      share_owner.image      AS ownerImage,
      t.id                   AS id,
      t.name                 AS name,
      t.description          AS description,
      t.album_url            AS albumUrl,
      t.start_date           AS startDate,
      t.end_date             AS endDate,
      -- Correlated scalar subqueries, not a derived table: a derived table
      -- cannot see the enclosing query's aliased trip row.
      CASE WHEN ${readableSql} THEN
        (SELECT COUNT(*) FROM journal_entries j WHERE ${tripEntryRowsSql}) END AS entryCount,
      CASE WHEN ${readableSql} THEN
        (SELECT COUNT(*) FROM sends s WHERE ${tripSendRowsSql}) END AS sendCount,
      CASE WHEN ${readableSql} THEN
        (SELECT COUNT(DISTINCT j.entry_date) FROM journal_entries j WHERE ${tripEntryRowsSql})
        END AS dayCount,
      (t.notes IS NOT NULL) AS hasNotes,
      CASE WHEN ${readableSql} THEN t.notes END AS notes
    ${shareFromSql}
    WHERE link.token = ${token}
  `);

  if (!row) return { status: "hidden" };
  if (row.readable !== 1) {
    // A closed profile is not an expiry, and saying so would report on the
    // owner rather than on the link.
    return row.ownerIsPrivate === 1
      ? { status: "hidden" }
      : { status: "expired", ownerId: row.ownerId, tripId: row.id };
  }

  const {
    readable: _readable,
    ownerIsPrivate: _ownerIsPrivate,
    ownerId,
    ownerName,
    ownerImage,
    notes,
    ...trip
  } = row;
  return {
    status: "visible",
    shared: {
      owner: { id: ownerId, name: ownerName, image: ownerImage },
      trip: { ...trip, companions: [] },
      notes,
    },
  };
}

/** The owner's own view of a trip's live link, for the trip page's Share
 * dialog. Scoped to the owner: this is the only read that hands out a token,
 * and a token is the credential. An expired link reads as none, decided by
 * the same `datetime('now')` comparison as `readableSql`, so the button never
 * says Shared for a link the page already calls expired; sharing again makes
 * a new token (`shareTrip`). */
export async function getTripShareForOwner(
  db: Database,
  ownerId: string,
  tripId: number,
): Promise<{ token: string; expiresAt: string | null } | null> {
  const row = await db.get<{ token: string; expiresAt: string | null }>(sql`
    SELECT token, expires_at AS expiresAt
    FROM trip_share_links WHERE user_id = ${ownerId} AND trip_id = ${tripId}
      AND (expires_at IS NULL OR expires_at > datetime('now'))
  `);
  return row ?? null;
}
