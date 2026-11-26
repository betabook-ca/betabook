import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

/** One link per climber per year, the whole of `/year/{token}`. Like a trip
 * link it has no audience: holding a live token is the permission, and it
 * opens the recap as its owner sees it. `year_review_share_revoke_on_private`
 * (migration 0058) deletes every row when a profile goes private. In
 * db/queries/year-review-shares.ts, `getSharedYearReview` resolves a token
 * under the shared `shareLinkReadableSql` predicate (not expired, owner not
 * private), and every read of the recap's rows re-checks it. */
export const yearReviewShareLinks = sqliteTable(
  "year_review_share_links",
  {
    token: text("token")
      .primaryKey()
      .notNull()
      .default(sql`(lower(hex(randomblob(16))))`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    /** UTC `YYYY-MM-DD HH:MM:SS`, or null for a link that does not expire. */
    expiresAt: text("expires_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    // One link per year, so changing the expiry is an upsert on this key and
    // the link already sent out keeps working.
    uniqueIndex("year_review_share_links_year_idx").on(t.userId, t.year),
    check("year_review_share_links_year", sql`${t.year} BETWEEN 1950 AND 9999`),
    check(
      "year_review_share_links_expires_at_format",
      sql`${t.expiresAt} IS NULL OR ${t.expiresAt} = datetime(${t.expiresAt})`,
    ),
  ],
);
