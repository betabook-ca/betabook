import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, real, index } from "drizzle-orm/sqlite-core";

import { areas } from "./areas";

export const climbs = sqliteTable(
  "climbs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    areaId: integer("area_id")
      .notNull()
      .references(() => areas.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    type: text("type", { enum: ["boulder", "sport", "trad"] }).notNull(),
    grade: integer("grade"),
    description: text("description"),
    // ISO date (YYYY-MM-DD) on which the climb broke, or null while intact.
    // Set only through an approved climb_break change request. Once set, new
    // sends and journal entries must be dated strictly before it (the
    // sends_reject_after_break_* / journal_reject_after_break_* triggers in
    // migration 0044 are the backstop for assertLoggableOnClimb). Existing
    // rows keep their dates; the triggers watch inserts and date changes only.
    brokenOn: text("broken_on"),
    // Denormalized aggregates over `sends`, incrementally maintained by
    // AFTER INSERT/UPDATE/DELETE triggers on sends (see
    // drizzle/migrations/0014_sends_aggregate_triggers.sql) — lets
    // getSubtreeClimbs sort by ascent count/rating from an index on climbs
    // alone, instead of joining an unscoped GROUP BY over the entire sends
    // table on every query. App code never writes these columns; the
    // triggers are the only writer, so no send write path can forget them.
    // ratingSum/ratingCount (not a running average) avoid floating-point
    // drift accumulating over years of incremental +/- updates.
    sendCount: integer("send_count").notNull().default(0),
    ratingSum: integer("rating_sum").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),
    // Populated by catalog imports when a source provides route-specific GPS
    // distinct from the parent area's; otherwise left null. Not required for
    // any existing query path.
    latitude: real("latitude"),
    longitude: real("longitude"),
    avgRating: real("avg_rating").generatedAlwaysAs(
      sql`CASE WHEN rating_count > 0 THEN CAST(rating_sum AS REAL) / rating_count ELSE NULL END`,
      { mode: "virtual" },
    ),
  },
  (t) => [
    index("climbs_area_idx").on(t.areaId),
    index("climbs_type_grade_idx").on(t.type, t.grade),
  ],
);
