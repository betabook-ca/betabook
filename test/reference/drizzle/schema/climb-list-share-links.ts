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
import { climbLists } from "./climb-lists";

/** One link per list, the whole of `/lists/{token}`. Like a trip link it has
 * no audience: holding a live token is the permission, and it opens the list
 * even when the owner's `climb_list_visibility` is Only me.
 * `climb_list_share_revoke_on_private` (migration 0057) deletes every row when
 * a profile goes private, and the composite foreign key deletes a list's link
 * with the list. `getSharedClimbList` in db/queries/climb-list-shares.ts
 * resolves a token only while it is unexpired and its owner is not private. */
export const climbListShareLinks = sqliteTable(
  "climb_list_share_links",
  {
    // A rowid table's text primary key is nullable unless it says otherwise.
    token: text("token")
      .primaryKey()
      .notNull()
      .default(sql`(lower(hex(randomblob(16))))`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    listId: integer("list_id").notNull(),
    /** UTC `YYYY-MM-DD HH:MM:SS`, or null for a link that does not expire. */
    expiresAt: text("expires_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    foreignKey({
      columns: [t.userId, t.listId],
      foreignColumns: [climbLists.userId, climbLists.id],
    }).onDelete("cascade"),
    // One share per list, so changing the expiry is an upsert on this key.
    uniqueIndex("climb_list_share_links_list_idx").on(t.userId, t.listId),
    check(
      "climb_list_share_links_expires_at_format",
      sql`${t.expiresAt} IS NULL OR ${t.expiresAt} = datetime(${t.expiresAt})`,
    ),
  ],
);
