import { integer, text, sqliteTable, primaryKey } from "drizzle-orm/sqlite-core";

import { goals } from "./goals";

/** Derived period counts, refreshed atomically with feed events and achievement detection. */
export const goalProgress = sqliteTable(
  "goal_progress",
  {
    goalId: integer("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    periodStart: text("period_start").notNull(),
    repeat: text("repeat", { enum: ["none", "week", "month", "year"] }).notNull(),
    periodEnd: text("period_end").notNull(),
    progress: integer("progress").notNull(),
    completedDate: text("completed_date"),
  },
  (t) => [primaryKey({ columns: [t.goalId, t.periodStart, t.repeat] })],
);
