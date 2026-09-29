import { sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { JournalCompanion } from "@/lib/journal-companions";

import { journalVisibleSql, tripNotesVisibleSql } from "./content-access";
import { tripCompanionsJsonSql } from "./trip-companions";

export type Trip = {
  id: number;
  name: string;
  description: string | null;
  /** Shared Google Photos album URL. Visible to anyone who can open the trip. */
  albumUrl: string | null;
  startDate: string;
  endDate: string;
};

export type TripSummary = Trip & {
  /** Journal entries (sessions and training) dated within the trip. Null if the
   * viewer can't read this user's journal. */
  entryCount: number | null;
  /** Dated sends inside the window. Undated sends are never counted: a null
   * `date_sent` cannot be shown to fall in the trip. */
  sendCount: number;
  /** Number of distinct dates with a journal entry, including training. This is
   * not the Analytics "Days out" tile, which counts outdoor sessions for one
   * discipline, so the UI calls it "days logged". Null when `entryCount` is
   * null. */
  dayCount: number | null;
  /** 1 if the trip has notes the viewer can read, otherwise 0. */
  hasNotes: number;
  /** Tagged friends. Empty if the viewer can't read the owner's journal. */
  companions: JournalCompanion[];
};

type TripRow = Omit<TripSummary, "companions"> & { companions: string };

function toTripSummary(row: TripRow): TripSummary {
  return { ...row, companions: JSON.parse(row.companions) as JournalCompanion[] };
}

/** Matches journal entries within a trip. Expects aliases `j` (entry) and `t`
 * (trip). Includes both `session` and `training` entries. */
const tripEntryRowsSql = sql`
  j.user_id = t.user_id AND j.entry_date BETWEEN t.start_date AND t.end_date
`;

/** Matches sends within a trip. Expects aliases `s` (send) and `t` (trip).
 * Undated sends are excluded because `NULL BETWEEN ...` is NULL. */
const tripSendRowsSql = sql`
  s.user_id = t.user_id AND s.date_sent BETWEEN t.start_date AND t.end_date
`;

/** Correlated scalar subqueries rather than joins: three independent
 * aggregates over two tables would otherwise multiply each other's rows, and a
 * derived table cannot see the enclosing query's `t`. */
function tripCountsSql(viewerId: string | null, share: string | null): SQL {
  const journalVisible = journalVisibleSql(viewerId, sql`t.user_id`);
  return sql`
    CASE WHEN ${journalVisible}
      THEN (SELECT COUNT(*) FROM journal_entries j WHERE ${tripEntryRowsSql}) END AS entryCount,
    (SELECT COUNT(*) FROM sends s WHERE ${tripSendRowsSql}) AS sendCount,
    CASE WHEN ${journalVisible}
      THEN (SELECT COUNT(DISTINCT j.entry_date) FROM journal_entries j WHERE ${tripEntryRowsSql})
      END AS dayCount,
    (t.notes IS NOT NULL AND ${tripNotesVisibleSql(viewerId, sql`t.user_id`, share)}) AS hasNotes,
    ${tripCompanionsJsonSql(viewerId, sql`t.id`)} AS companions
  `;
}

const tripColumnsSql = sql`
  t.id          AS id,
  t.name        AS name,
  t.description AS description,
  t.album_url   AS albumUrl,
  t.start_date  AS startDate,
  t.end_date    AS endDate
`;

/** Trips are visible to anyone who can see the owner's sends. This is
 * `canViewUser` in SQL, so it is checked on every read. A null viewer is a
 * signed-out visitor whose share link the page has already validated. */
function tripRowsSql(userId: string, viewerId: string | null): SQL {
  return sql`
    FROM trips t
    JOIN user trip_owner ON trip_owner.id = t.user_id
    WHERE t.user_id = ${userId}
      AND (trip_owner.is_private = 0 OR trip_owner.id = ${viewerId})
  `;
}

/** Newest first. `id` breaks ties so trips starting the same day keep a stable
 * order. */
export async function getTripsForUser(
  db: Database,
  userId: string,
  viewerId: string | null,
): Promise<TripSummary[]> {
  const rows = await db.all<TripRow>(sql`
    SELECT ${tripColumnsSql}, ${tripCountsSql(viewerId, null)}
    ${tripRowsSql(userId, viewerId)}
    ORDER BY t.start_date DESC, t.id DESC
  `);
  return rows.map(toTripSummary);
}

/** Filters by `userId` in the query, so a trip id that belongs to someone else
 * returns nothing. */
export async function getTripForUser(
  db: Database,
  userId: string,
  tripId: number,
  viewerId: string | null,
  /** Share token from the URL, if any. A valid token allows reading notes. */
  share: string | null = null,
): Promise<TripSummary | null> {
  const row = await db.get<TripRow>(sql`
    SELECT ${tripColumnsSql}, ${tripCountsSql(viewerId, share)}
    ${tripRowsSql(userId, viewerId)} AND t.id = ${tripId}
  `);
  return row ? toTripSummary(row) : null;
}

/** Uses the same predicate as `getTripNotes`. */
export async function canReadTripNotes(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  share: string | null = null,
) {
  const row = await db.get<{ visible: number }>(
    sql`SELECT ${tripNotesVisibleSql(viewerId, sql`${ownerId}`, share)} AS visible`,
  );
  return row?.visible === 1;
}

/** Notes are loaded separately because the list and the header don't need them. */
export async function getTripNotes(
  db: Database,
  userId: string,
  tripId: number,
  viewerId: string | null,
  share: string | null = null,
): Promise<string | null> {
  const row = await db.get<{ notes: string | null }>(sql`
    SELECT t.notes AS notes
    ${tripRowsSql(userId, viewerId)} AND t.id = ${tripId}
      AND ${tripNotesVisibleSql(viewerId, sql`t.user_id`, share)}
  `);
  return row?.notes ?? null;
}
