import { integer, text, sqliteTable, primaryKey } from "drizzle-orm/sqlite-core";

import { goals } from "./goals";

/** Detection and acknowledgement are independent of the civil date of the contributing log. */
export const goalAchievements = sqliteTable(
  "goal_achievements",
  {
    goalId: integer("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    periodStart: text("period_start").notNull(),
    repeat: text("repeat", { enum: ["none", "week", "month", "year"] }).notNull(),
    detectedAt: text("detected_at").notNull(),
    acknowledgedAt: text("acknowledged_at"),
  },
  (t) => [primaryKey({ columns: [t.goalId, t.periodStart, t.repeat] })],
);
