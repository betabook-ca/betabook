import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { friendships } from "./friendships";
import { trips } from "./trips";

/** Same columns, guards and tombstone as `journal_companions`, for trips. */
export const tripCompanions = sqliteTable(
  "trip_companions",
  {
    tripId: integer("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    friendshipUserId: text("friendship_user_id").notNull(),
    friendshipFriendId: text("friendship_friend_id").notNull(),
    suppressed: integer("suppressed", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.userId] }),
    foreignKey({
      columns: [t.friendshipUserId, t.friendshipFriendId],
      foreignColumns: [friendships.userId, friendships.friendId],
    }).onDelete("cascade"),
    index("trip_companions_friendship_idx").on(t.friendshipUserId, t.friendshipFriendId),
    index("trip_companions_user_idx").on(t.userId, t.tripId),
    index("trip_companions_active_idx")
      .on(t.tripId, t.userId)
      .where(sql`${t.suppressed} = 0`),
    check("trip_companions_suppressed_bool", sql`${t.suppressed} IN (0, 1)`),
  ],
);
