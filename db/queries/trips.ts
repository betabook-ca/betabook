import { sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { JournalCompanion } from "@/lib/journal-companions";

import { journalVisibleSql, tripNotesVisibleSql } from "./content-access";
import { tripCompanionsJsonSql } from "./trip-companions";

export type Trip = {
  id: number;
  name: string;
  description: string | null;
  /** A shared Google Photos album, shown to whoever can open the trip. */
  albumUrl: string | null;
  startDate: string;
  endDate: string;
};

export type TripSummary = Trip & {
  /** Journal entries dated inside the window, both sessions and training.
   * Null for a reader who may not read this climber's journal. */
  entryCount: number | null;
  /** Dated sends inside the window. Undated sends are never counted: a null
   * `date_sent` cannot be shown to fall in the trip. */
  sendCount: number;
  /** Distinct dates with any entry, training included — not the calendar
   * length of the trip, and deliberately not the Analytics tab's "Days out".
   * That tile counts outdoor sessions in one discipline, so it answers a
   * narrower question; the card says "days logged" rather than borrowing its
   * words for a different number. Null with `entryCount`. */
  dayCount: number | null;
  /** 1 when there are notes this reader may read, as the climber or a friend
   * of theirs, so a tab is not offered that would open onto nothing. */
  hasNotes: number;
  /** Friends tagged on the trip, empty for a reader the journal is not
   * shared with. */
  companions: JournalCompanion[];
};

type TripRow = Omit<TripSummary, "companions"> & { companions: string };

function toTripSummary(row: TripRow): TripSummary {
  return { ...row, companions: JSON.parse(row.companions) as JournalCompanion[] };
}

/** Which journal rows fall inside a trip, over an aliased `j` row and an
 * aliased `t` trip row. Every kind counts, `session` and `training` alike,
 * because the trip's Journal tab lists both. */
const tripEntryRowsSql = sql`
  j.user_id = t.user_id AND j.entry_date BETWEEN t.start_date AND t.end_date
`;

/** Which sends fall inside a trip, over an aliased `s` send row and `t` trip
 * row. `date_sent` is nullable and `NULL BETWEEN …` is NULL rather than true,
 * so an undated send is excluded by the comparison itself. */
const tripSendRowsSql = sql`
  s.user_id = t.user_id AND s.date_sent BETWEEN t.start_date AND t.end_date
`;

/** Correlated scalar subqueries rather than joins: three independent
 * aggregates over two tables would otherwise multiply each other's rows, and a
 * derived table cannot see the enclosing query's `t`. */
function tripCountsSql(viewerId: string | null): SQL {
  const journalVisible = journalVisibleSql(viewerId, sql`t.user_id`);
  return sql`
    CASE WHEN ${journalVisible}
      THEN (SELECT COUNT(*) FROM journal_entries j WHERE ${tripEntryRowsSql}) END AS entryCount,
    (SELECT COUNT(*) FROM sends s WHERE ${tripSendRowsSql}) AS sendCount,
    CASE WHEN ${journalVisible}
      THEN (SELECT COUNT(DISTINCT j.entry_date) FROM journal_entries j WHERE ${tripEntryRowsSql})
      END AS dayCount,
    (t.notes IS NOT NULL AND ${tripNotesVisibleSql(viewerId, sql`t.user_id`)}) AS hasNotes,
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

/** A trip is read by whoever may see the climber's sends, which is
 * `canViewUser` said in SQL so a profile closing takes effect on the next
 * read rather than the next page gate. A null viewer holds the climber's
 * profile link, which the page checks; the journal's audiences never admit
 * one, so they get the trip and its sends and nothing else. */
function tripRowsSql(userId: string, viewerId: string | null): SQL {
  return sql`
    FROM trips t
    JOIN user trip_owner ON trip_owner.id = t.user_id
    WHERE t.user_id = ${userId}
      AND (trip_owner.is_private = 0 OR trip_owner.id = ${viewerId})
  `;
}

/** Newest window first, with `id` as the tiebreak so two trips starting the
 * same day keep a stable order across loads. */
export async function getTripsForUser(
  db: Database,
  userId: string,
  viewerId: string | null,
): Promise<TripSummary[]> {
  const rows = await db.all<TripRow>(sql`
    SELECT ${tripColumnsSql}, ${tripCountsSql(viewerId)}
    ${tripRowsSql(userId, viewerId)}
    ORDER BY t.start_date DESC, t.id DESC
  `);
  return rows.map(toTripSummary);
}

/** Scoped to `userId` in the WHERE rather than checked afterwards, so a
 * guessed id reads as "no such trip" instead of confirming one exists. */
export async function getTripForUser(
  db: Database,
  userId: string,
  tripId: number,
  viewerId: string | null,
): Promise<TripSummary | null> {
  const row = await db.get<TripRow>(sql`
    SELECT ${tripColumnsSql}, ${tripCountsSql(viewerId)}
    ${tripRowsSql(userId, viewerId)} AND t.id = ${tripId}
  `);
  return row ? toTripSummary(row) : null;
}

/** Uses the same current permission predicate as the notes' own read. */
export async function canReadTripNotes(db: Database, ownerId: string, viewerId: string | null) {
  const row = await db.get<{ visible: number }>(
    sql`SELECT ${tripNotesVisibleSql(viewerId, sql`${ownerId}`)} AS visible`,
  );
  return row?.visible === 1;
}

/** Read apart from `tripColumnsSql`: the list and every tab's header select
 * those columns, and none of them shows the notes. */
export async function getTripNotes(
  db: Database,
  userId: string,
  tripId: number,
  viewerId: string | null,
): Promise<string | null> {
  const row = await db.get<{ notes: string | null }>(sql`
    SELECT t.notes AS notes
    ${tripRowsSql(userId, viewerId)} AND t.id = ${tripId}
      AND ${tripNotesVisibleSql(viewerId, sql`t.user_id`)}
  `);
  return row?.notes ?? null;
}
