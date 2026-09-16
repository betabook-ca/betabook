import { integer, text, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";

import type { GoalTitleInput } from "@/lib/goals";

import { goals } from "./goals";

/** Persisted feed projection; refreshed from qualifying logs independently of notices and archives. */
export const goalCompletions = sqliteTable(
  "goal_completions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    goalId: integer("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    periodStart: text("period_start").notNull(),
    repeat: text("repeat", { enum: ["none", "week", "month", "year"] }).notNull(),
    completedDate: text("completed_date"),
    definition: text("definition", { mode: "json" }).$type<GoalTitleInput>().notNull(),
  },
  (t) => [uniqueIndex("goal_completions_period_idx").on(t.goalId, t.periodStart, t.repeat)],
);
