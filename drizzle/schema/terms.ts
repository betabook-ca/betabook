import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

/** One immutable acceptance per account/version, maintained by SQL triggers. */
export const userTermsAcceptances = sqliteTable(
  "user_terms_acceptances",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.version] })],
);
