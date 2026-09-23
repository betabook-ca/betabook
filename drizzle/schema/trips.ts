import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

/** A named window over the climber's own history — "Bishop, March 2026".
 *
 * A trip owns no entries. Nothing is assigned to it and nothing is copied into
 * it: the Journal, Sends and Analytics tabs are the existing reads with
 * `dateFrom`/`dateTo` pinned to the two dates below, so logging is completely
 * unaffected by whether a trip happens to cover the day. That is why trips can
 * overlap freely, why deleting one destroys no climbing record, and why a
 * backdated entry joins the trip it falls inside without anything being
 * rewritten.
 *
 * The dates are civil dates with no zone, matching `journal_entries.entry_date`
 * and `sends.date_sent`, because membership is a string comparison against
 * those columns. There is deliberately no `timezone` column, unlike `goals`: a
 * goal period rolls over against "today" and so needs to know whose midnight,
 * while a trip window is two fixed dates that never move. Where the list labels
 * a trip upcoming or past it resolves today from the request instead. */
export const trips = sqliteTable(
  "trips",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Civil ISO `YYYY-MM-DD`, inclusive. */
    startDate: text("start_date").notNull(),
    /** Civil ISO `YYYY-MM-DD`, inclusive — a one-day trip has both equal. */
    endDate: text("end_date").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [
    index("trips_user_start_idx").on(t.userId, t.startDate),
    // The share link in a later migration carries a composite foreign key to
    // (user_id, id) so a token cannot be pointed at another climber's trip.
    // SQLite requires the parent columns of such a key to be a unique index,
    // and `id` alone being the primary key does not satisfy it for the pair.
    uniqueIndex("trips_user_id_idx").on(t.userId, t.id),
    check("trips_dates", sql`${t.endDate} >= ${t.startDate}`),
    // Enforced here as well as in the schema the action validates against: a
    // blank name would leave a trip nothing can refer to in a list or a link.
    check("trips_name", sql`length(trim(${t.name})) BETWEEN 1 AND 80`),
    check("trips_description", sql`${t.description} IS NULL OR length(${t.description}) <= 2000`),
  ],
);
