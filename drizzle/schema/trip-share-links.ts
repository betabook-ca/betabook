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

/** Unused: trips no longer have their own share links. The table stays in the
 * schema so drizzle-kit doesn't generate a DROP. Migrations run before the new
 * worker is live, so the old worker still needs the table during a deploy. A
 * later migration should drop it together with the
 * `trip_share_revoke_on_private` trigger. That trigger is on `user`, so
 * dropping only the table would make every switch to private fail. */
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
