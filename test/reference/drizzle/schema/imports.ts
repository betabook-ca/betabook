import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { ImportResult } from "@/lib/sends";

import { user } from "./auth";

export const importBatches = sqliteTable(
  "import_batches",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    batchId: text("batch_id").notNull(),
    requestHash: text("request_hash").notNull(),
    result: text("result", { mode: "json" }).$type<ImportResult>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.batchId] })],
);
