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
import { journalEntries } from "./journal";

export const journalCompanions = sqliteTable(
  "journal_companions",
  {
    entryId: integer("entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    friendshipUserId: text("friendship_user_id").notNull(),
    friendshipFriendId: text("friendship_friend_id").notNull(),
    suppressed: integer("suppressed", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.userId] }),
    foreignKey({
      columns: [t.friendshipUserId, t.friendshipFriendId],
      foreignColumns: [friendships.userId, friendships.friendId],
    }).onDelete("cascade"),
    index("journal_companions_friendship_idx").on(t.friendshipUserId, t.friendshipFriendId),
    index("journal_companions_user_idx").on(t.userId, t.entryId),
    index("journal_companions_active_idx")
      .on(t.entryId, t.userId)
      .where(sql`${t.suppressed} = 0`),
    check("journal_companions_suppressed_bool", sql`${t.suppressed} IN (0, 1)`),
  ],
);
