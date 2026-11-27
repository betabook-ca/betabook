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

/** One link per trip, the whole of `/trips/{token}`. Like a project link it
 * has no audience: holding a live token is the permission, and it opens the
 * trip as its owner sees it. `trip_share_revoke_on_private` (migration 0050)
 * deletes every row when a profile goes private, and the composite foreign key
 * deletes a trip's link with the trip. In db/queries/trip-shares.ts,
 * `getSharedTrip` resolves a token under the private `readableSql` predicate
 * (not expired, owner not private), and every read of the trip's rows applies
 * `tripLinkCoversSql`, which adds the trip's dates. */
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
