import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { tripEntryRowsSql, tripSendRowsSql } from "@/db/queries/trips";
import type { ClimbType } from "@/lib/grades";
import type { JournalKind } from "@/lib/journal";
import type { AscentStyle, GradeFeel } from "@/lib/sends";

/** One journal entry on a shared trip. Narrower than `JournalEntry` in exactly
 * one respect: no companions. A companion tag names a friend who agreed to
 * appear on the owner's journal, not to be named to whoever holds a link —
 * they are the one party here who never saw the share dialog. Everything else
 * the owner's own timeline carries travels with the link, because creating one
 * is the owner's decision to show this trip. */
export type SharedTripEntry = {
  id: number;
  kind: JournalKind;
  entryDate: string;
  body: string | null;
  tags: string[];
  sent: boolean;
  climbId: number | null;
  climbName: string | null;
  climbType: ClimbType | null;
  climbGrade: number | null;
  areaId: number | null;
  areaName: string | null;
};

/** One send inside the window, as the owner logged it. */
export type SharedTripSend = {
  climbId: number;
  climbName: string;
  climbType: ClimbType;
  climbGrade: number | null;
  areaId: number;
  areaName: string;
  dateSent: string;
  ascentStyle: AscentStyle;
  rating: number | null;
  suggestedGrade: number | null;
  gradeFeel: GradeFeel | null;
  comment: string | null;
};

/** What a valid link resolves to: the owner's own view of one trip.
 *
 * The share dialog says "this trip's sessions, notes and sends" before the
 * link exists, and that sentence is the consent this page rests on, so
 * anything added here has to stay inside what it already covers. A field a
 * climber would not expect under those words needs the copy changed first.
 *
 * The counts come from the same fragments the owner's own trip card counts
 * with, so a trip cannot report one number on the card and another on the page
 * that card links to. */
export type SharedTrip = {
  ownerId: string;
  ownerName: string;
  ownerImage: string | null;
  tripId: number;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  entryCount: number;
  sendCount: number;
  dayCount: number;
};

/** Why a link did not resolve. `hidden` covers "no such token", "the trip is
 * gone" and "the owner went private" alike: a reader is never told which,
 * though in practice only someone who was given the link ever asks. */
export type SharedTripAccess =
  | { status: "hidden"; trip?: undefined }
  | { status: "expired"; trip?: undefined }
  | { status: "visible"; trip: SharedTrip };

/**
 * What makes a link readable, as conditions over an aliased `link` row.
 *
 * There is no viewer in it, and that is the design: a trip link carries no
 * audience, so holding the URL is the whole of the permission. What can still
 * revoke it lives here instead — the deadline passing, and the owner having
 * gone private. Both are read inside the statement rather than trusted from
 * page props, so a link stops answering on the next load rather than whenever
 * some cache happens to turn over.
 *
 * The private check is belt and braces: the trigger in migration 0050 deletes
 * every row when a profile closes, so a row should not survive to be caught
 * here. It covers the one case the trigger cannot — a share written in the
 * same moment the profile was closing.
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

/** The shared trip, and whether the link resolves at all, in one read.
 *
 * Deriving the owner and the trip from the token row — never from the route —
 * is what keeps a link reachable to only the one trip it was made for.
 *
 * Status and data come back together rather than from two statements, which
 * means the owner's name and the trip are selected even when the answer is
 * "expired". They are read into the worker and dropped; the sensitive payload
 * is the entries and sends, and those stay behind their own reads with their
 * own copies of the predicate. */
export async function getSharedTrip(db: Database, token: string): Promise<SharedTripAccess> {
  const row = await db.get<SharedTrip & { readable: number; ownerIsPrivate: number }>(sql`
    SELECT
      ${readableSql}         AS readable,
      share_owner.is_private AS ownerIsPrivate,
      share_owner.id         AS ownerId,
      share_owner.name       AS ownerName,
      share_owner.image      AS ownerImage,
      t.id                   AS tripId,
      t.name                 AS name,
      t.description          AS description,
      t.start_date           AS startDate,
      t.end_date             AS endDate,
      -- Correlated scalar subqueries, not a derived table: a derived table
      -- cannot see the enclosing query's aliased trip row.
      (SELECT COUNT(*) FROM journal_entries j WHERE ${tripEntryRowsSql}) AS entryCount,
      (SELECT COUNT(*) FROM sends s WHERE ${tripSendRowsSql}) AS sendCount,
      (SELECT COUNT(DISTINCT j.entry_date) FROM journal_entries j WHERE ${tripEntryRowsSql})
        AS dayCount
    ${shareFromSql}
    WHERE link.token = ${token}
  `);

  if (!row) return { status: "hidden" };
  if (row.readable !== 1) {
    // A closed profile is not an expiry, and saying so would report on the
    // owner rather than on the link.
    return { status: row.ownerIsPrivate === 1 ? "hidden" : "expired" };
  }

  const { readable: _readable, ownerIsPrivate: _ownerIsPrivate, ...trip } = row;
  return { status: "visible", trip };
}

/** Bounded rather than paginated: a public endpoint that took a cursor would
 * be a second door onto this data, and the page is a trip report, not the
 * climber's journal. A trip is a handful of days, so the cap is generous
 * enough that it almost never truncates. */
const SHARED_TRIP_ENTRIES = 200;
const SHARED_TRIP_SENDS = 200;

function bounded(limit: number, cap: number): number {
  return Number.isInteger(limit) ? Math.min(Math.max(limit, 1), cap) : cap;
}

/** The journal entries inside the window, newest first, under the same
 * predicate as everything else.
 *
 * Note what is *not* filtered out here, unlike the project share before #334:
 * send commentary and ascent entries are included, because the link publishes
 * the sends themselves and withholding the note attached to one would hide the
 * entry a reader most expects to find. `tripEntryRowsSql` is the owner's own
 * membership rule, so this timeline is the one their Journal tab shows. */
export async function getSharedTripEntries(
  db: Database,
  token: string,
  limit: number = SHARED_TRIP_ENTRIES,
): Promise<SharedTripEntry[]> {
  const rows = await db.all<
    Omit<SharedTripEntry, "tags" | "sent"> & { tags: string | null; sent: number }
  >(sql`
    SELECT
      j.id          AS id,
      j.kind        AS kind,
      j.entry_date  AS entryDate,
      j.body        AS body,
      j.tags        AS tags,
      j.sent        AS sent,
      j.climb_id    AS climbId,
      climbs.name   AS climbName,
      climbs.type   AS climbType,
      climbs.grade  AS climbGrade,
      climbs.area_id AS areaId,
      areas.name    AS areaName
    ${shareFromSql}
    JOIN journal_entries j ON ${tripEntryRowsSql}
    LEFT JOIN climbs ON climbs.id = j.climb_id
    LEFT JOIN areas ON areas.id = climbs.area_id
    WHERE link.token = ${token} AND ${readableSql}
    ORDER BY j.entry_date DESC, j.id DESC
    LIMIT ${bounded(limit, SHARED_TRIP_ENTRIES)}
  `);
  return rows.map((row) => ({
    ...row,
    sent: row.sent === 1,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
  }));
}

/** The sends dated inside the window, newest first. `date_sent` is nullable
 * and `NULL BETWEEN …` is NULL rather than true, so an undated send is
 * excluded by the comparison itself — it cannot be shown to fall in the trip. */
export async function getSharedTripSends(
  db: Database,
  token: string,
  limit: number = SHARED_TRIP_SENDS,
): Promise<SharedTripSend[]> {
  return db.all<SharedTripSend>(sql`
    SELECT
      s.climb_id        AS climbId,
      climbs.name       AS climbName,
      climbs.type       AS climbType,
      climbs.grade      AS climbGrade,
      climbs.area_id    AS areaId,
      areas.name        AS areaName,
      s.date_sent       AS dateSent,
      s.ascent_style    AS ascentStyle,
      s.rating          AS rating,
      s.suggested_grade AS suggestedGrade,
      s.grade_feel      AS gradeFeel,
      s.comment         AS comment
    ${shareFromSql}
    JOIN sends s ON ${tripSendRowsSql}
    JOIN climbs ON climbs.id = s.climb_id
    JOIN areas ON areas.id = climbs.area_id
    WHERE link.token = ${token} AND ${readableSql}
    ORDER BY s.date_sent DESC, s.id DESC
    LIMIT ${bounded(limit, SHARED_TRIP_SENDS)}
  `);
}

/** The owner's own view of a link, for the trip header and the dialog. Scoped
 * to the owner: this is the only read that hands out a token, and a token is
 * the credential. */
export async function getTripShareForOwner(
  db: Database,
  ownerId: string,
  tripId: number,
): Promise<{ token: string; expiresAt: string | null } | null> {
  const row = await db.get<{ token: string; expiresAt: string | null }>(sql`
    SELECT token, expires_at AS expiresAt
    FROM trip_share_links WHERE user_id = ${ownerId} AND trip_id = ${tripId}
  `);
  return row ?? null;
}
