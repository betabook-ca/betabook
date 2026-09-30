import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { climbs } from "./climbs";

export const sends = sqliteTable(
  "sends",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    climbId: integer("climb_id")
      .notNull()
      // A climb with logged sends is historical data, not an aggregate that
      // should disappear with its parent.
      .references(() => climbs.id, { onDelete: "restrict" }),
    ascentStyle: text("ascent_style", {
      enum: ["redpoint", "flash", "onsight"],
    }).notNull(),
    // ISO date (YYYY-MM-DD) — when the climb was actually sent, not when
    // this row was logged/edited (that's createdAt/updatedAt below). Nullable
    // since older/imported sends often have no recorded date at all.
    dateSent: text("date_sent"),
    comment: text("comment"),
    rating: integer("rating"), // 1-5, nullable = abstained
    suggestedGrade: integer("suggested_grade"), // same ordinal space as climbs.grade, scoped by climb.type
    gradeFeel: text("grade_feel", { enum: ["low", "solid", "high"] })
      .notNull()
      .default("solid"),
    // Up to MAX_SEND_VIDEOS canonical YouTube or Instagram links to videos of
    // the send, in the climber's order, shown to the send commentary audience.
    // Each is the exact form `sendVideoUrl` writes in lib/send-video.ts, and
    // migration 0052's triggers reject any other shape. Null when none.
    videos: text("videos", { mode: "json" }).$type<string[]>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  // sends_user_date_idx (keyset CSV export) contains a descending column, so
  // it's declared in a hand-written migration instead of here, because
  // drizzle-kit doesn't model descending index columns (same reason the nine
  // climbs sort indexes from 0010_climb_sort_indexes.sql aren't in
  // drizzle/schema/climbs.ts). Nothing in this file will tell you it exists.
  (t) => [
    uniqueIndex("sends_user_climb_unique").on(t.userId, t.climbId),
    index("sends_climb_idx").on(t.climbId),
    index("sends_user_idx").on(t.userId),
  ],
);
