import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { RecapSnapshot } from "@/lib/recap-share";

import { user } from "./auth";

/** Separate owner-issued grants. The profile token captured here is checked
 * on every read so making the profile private or resetting its link revokes
 * earlier recap shares too. The snapshot never changes after issue. */
export const recapShares = sqliteTable(
  "recap_shares",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    profileToken: text("profile_token").notNull(),
    snapshot: text("snapshot", { mode: "json" }).$type<RecapSnapshot>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [index("recap_shares_user_idx").on(table.userId)],
);
