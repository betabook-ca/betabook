import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";

export type Trip = {
  id: number;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
};

export type TripSummary = Trip & {
  /** Journal entries dated inside the window, both sessions and training —
   * the rows the trip's own Journal tab lists at its default `all` view. */
  entryCount: number;
  /** Dated sends inside the window. Undated sends are never counted: a null
   * `date_sent` cannot be shown to fall in the trip. */
  sendCount: number;
  /** Distinct days the climber logged something, which is what "6 days out"
   * on the card means — not the calendar length of the trip. */
  dayCount: number;
};

/**
 * Which journal rows belong to a trip, as conditions over an aliased `j` row
 * and an aliased `t` trip row.
 *
 * A named fragment rather than two inline copies because both counts below
 * and, later, the share link's own reads have to agree on what "in the trip"
 * means. A second copy is how a trip ends up reporting one count on the
 * owner's card and another on the page that card links to — a drift this repo
 * has already had to repair once, in the project share. Export it when the
 * second reader arrives; until then it stays local.
 *
 * Every kind counts, `session` and `training` alike, because the trip's
 * Journal tab lists both. Send commentary and ascent entries are included for
 * the same reason: they are rows the owner's own timeline shows, and a trip is
 * a window onto that timeline, not a filtered view of it.
 */
const tripEntryRowsSql = sql`
  j.user_id = t.user_id AND j.entry_date BETWEEN t.start_date AND t.end_date
`;

/** Which sends belong to a trip, over an aliased `s` send row and `t` trip row.
 * `date_sent` is nullable and `NULL BETWEEN …` is NULL rather than true, so an
 * undated send is excluded by the comparison itself. */
const tripSendRowsSql = sql`
  s.user_id = t.user_id AND s.date_sent BETWEEN t.start_date AND t.end_date
`;

/** Correlated scalar subqueries rather than joins: three independent
 * aggregates over two tables would otherwise multiply each other's rows, and a
 * derived table cannot see the enclosing query's `t`. */
const tripCountsSql = sql`
  (SELECT COUNT(*) FROM journal_entries j WHERE ${tripEntryRowsSql}) AS entryCount,
  (SELECT COUNT(*) FROM sends s WHERE ${tripSendRowsSql}) AS sendCount,
  (SELECT COUNT(DISTINCT j.entry_date) FROM journal_entries j WHERE ${tripEntryRowsSql})
    AS dayCount
`;

const tripColumnsSql = sql`
  t.id          AS id,
  t.name        AS name,
  t.description AS description,
  t.start_date  AS startDate,
  t.end_date    AS endDate
`;

/** The climber's own trips, newest window first.
 *
 * Trips are owner-only by every read, so `ownerId` is always the session's own
 * user id and there is no viewer to check against it. Scoping on `user_id`
 * inside the statement is the whole of the authorization, which is why no
 * caller may pass an id taken from the route without having compared it to the
 * session first.
 *
 * Ordered by start date descending so the most recent trip leads, with `id` as
 * the tiebreak so two trips starting the same day keep a stable order across
 * loads rather than swapping places.
 */
export async function getTripsForOwner(db: Database, ownerId: string): Promise<TripSummary[]> {
  return db.all<TripSummary>(sql`
    SELECT ${tripColumnsSql}, ${tripCountsSql}
    FROM trips t
    WHERE t.user_id = ${ownerId}
    ORDER BY t.start_date DESC, t.id DESC
  `);
}
