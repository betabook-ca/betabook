import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, index, check } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

export const goals = sqliteTable(
  "goals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["volume", "grade", "training", "days", "new-areas"] }).notNull(),
    target: integer("target").notNull(),
    discipline: text("discipline", { enum: ["boulder", "sport", "trad"] }),
    grade: integer("grade"),
    timeframe: text("timeframe", { enum: ["week", "month", "year", "custom"] }).notNull(),
    repeat: text("repeat", { enum: ["none", "week", "month", "year"] })
      .notNull()
      .default("none"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    timezone: text("timezone").notNull(),
    celebrationsInitialized: integer("celebrations_initialized", { mode: "boolean" })
      .notNull()
      .default(false),
    archiveToken: text("archive_token"),
    gradeMatch: text("grade_match", { enum: ["exact", "at-least"] })
      .notNull()
      .default("exact"),
    tags: text("tags", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    recurringEndDate: text("recurring_end_date"),
  },
  (t) => [
    index("goals_user_idx").on(t.userId),
    check("goals_target", sql`${t.target} BETWEEN 1 AND 1000`),
    check("goals_dates", sql`${t.endDate} >= ${t.startDate}`),
    check(
      "goals_repeat",
      sql`${t.repeat} = 'none' OR (${t.repeat} IN ('week','month','year') AND ${t.kind} <> 'grade' AND (${t.kind} <> 'training' OR ${t.repeat} <> 'year'))`,
    ),
    check(
      "goals_shape",
      sql`(${t.kind} IN ('volume','grade') AND ${t.discipline} IN ('boulder','sport','trad') AND (${t.grade} IS NULL OR ${t.grade} >= 0) AND (${t.kind} <> 'grade' OR (${t.grade} IS NOT NULL AND ${t.target} = 1))) OR (${t.kind} IN ('training','days','new-areas') AND ${t.discipline} IS NULL AND ${t.grade} IS NULL)`,
    ),
  ],
);
