import { integer, text, sqliteTable, primaryKey } from "drizzle-orm/sqlite-core";

import { goals } from "./goals";

/** Preserve historical period definitions when an owner edits a recurring goal. Progress remains derived from logs. */
export const goalPeriods = sqliteTable(
  "goal_periods",
  {
    goalId: integer("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    target: integer("target").notNull(),
    repeat: text("repeat", { enum: ["week", "month", "year"] }).notNull(),
    timezone: text("timezone").notNull(),
    kind: text("kind", { enum: ["volume", "grade", "training", "days", "new-areas"] }).notNull(),
    discipline: text("discipline", { enum: ["boulder", "sport", "trad"] }),
    grade: integer("grade"),
    gradeMatch: text("grade_match", { enum: ["exact", "at-least"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.goalId, t.startDate, t.repeat] })],
);
