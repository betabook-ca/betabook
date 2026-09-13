import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { climbs } from "./climbs";

export const journalEntries = sqliteTable(
  "journal_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    climbId: integer("climb_id").references(() => climbs.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: ["session", "training"] }).notNull(),
    sent: integer("sent", { mode: "boolean" }).default(false).notNull(),
    isAscent: integer("is_ascent", { mode: "boolean" }).default(false).notNull(),
    // Commentary keeps its audience when deleting a send demotes its ascent to a session.
    isSendComment: integer("is_send_comment", { mode: "boolean" }).default(false).notNull(),
    entryDate: text("entry_date").notNull(),
    body: text("body"),
    tags: text("tags", { mode: "json" }).$type<string[]>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [
    index("journal_user_climb_idx").on(t.userId, t.climbId),
    index("journal_climb_idx").on(t.climbId),
    uniqueIndex("journal_ascent_unique")
      .on(t.userId, t.climbId)
      .where(sql`${t.isAscent} = 1`),
    check("journal_ascent_shape", sql`${t.isAscent} = 0 OR (${t.isAscent} = 1 AND ${t.sent} = 1)`),
    check("journal_kind_valid", sql`${t.kind} IN ('session', 'training')`),
    check("journal_sent_boolean", sql`${t.sent} IN (0, 1)`),
    check(
      "journal_training_shape",
      sql`${t.kind} <> 'training' OR (${t.climbId} IS NULL AND ${t.sent} = 0)`,
    ),
    check("journal_sent_needs_climb", sql`${t.sent} = 0 OR ${t.climbId} IS NOT NULL`),
    check("journal_session_needs_climb", sql`${t.kind} <> 'session' OR ${t.climbId} IS NOT NULL`),
  ],
);
