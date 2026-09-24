import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { trips } from "./trips";

/** One climber's decision to show one trip to someone outside the Trips tab,
 * which is otherwise owner-only.
 *
 * There is no audience column, deliberately — the same reasoning as
 * `project_share_links`. A link is a link: whoever holds it can open it,
 * signed in or not. Labelling one Friends or Members would borrow the journal
 * audience's words for a mechanism that does not mean the same thing, and
 * someone reading "Friends" on a URL would reasonably conclude it was safe to
 * forward. The two controls a link can honestly offer are how long it lasts
 * and deleting it.
 *
 * The token is the whole credential and the whole URL — no user or trip id in
 * it, nothing to enumerate, and nothing revealed until it resolves.
 *
 * A share grants MORE than the owner's blanket `journal_visibility` and
 * `send_comment_visibility` for the entries inside the window — that is the
 * feature, not an oversight. It grants nothing else: companion tags are left
 * out because they name third parties who never saw this dialog, and no entry
 * outside the trip's dates is reachable through it.
 *
 * The composite foreign key is the invariant that matters: a share cannot
 * outlive the trip it describes, and cannot be pointed at a trip belonging to
 * someone else. Deleting the trip and deleting the account both take the link
 * with them. The second key to `user` is redundant through that path and kept
 * anyway, so an orphan cannot survive a manual `trips` repair. */
export const tripShareLinks = sqliteTable(
  "trip_share_links",
  {
    // A rowid table's text primary key is nullable unless it says otherwise,
    // and a NULL token would be a link that matches nothing.
    token: text("token")
      .primaryKey()
      .notNull()
      .default(sql`(lower(hex(randomblob(16))))`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tripId: integer("trip_id").notNull(),
    /** UTC `YYYY-MM-DD HH:MM:SS`, or null for a link that does not expire.
     * Written by `datetime('now', …)` so the deadline comes from the database
     * rather than from an unsynced client clock. */
    expiresAt: text("expires_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    foreignKey({
      columns: [t.userId, t.tripId],
      foreignColumns: [trips.userId, trips.id],
    }).onDelete("cascade"),
    // One share per trip, so changing the expiry is an upsert on this key and
    // the link already sent out keeps working. Doubles as the child-side index
    // the cascade needs.
    uniqueIndex("trip_share_links_trip_idx").on(t.userId, t.tripId),
    // Comparing against datetime('now') is string comparison, so one ISO
    // 'YYYY-MM-DDTHH:MM:SSZ' write would silently make a link permanent.
    check(
      "trip_share_links_expires_at_format",
      sql`${t.expiresAt} IS NULL OR ${t.expiresAt} = datetime(${t.expiresAt})`,
    ),
  ],
);
