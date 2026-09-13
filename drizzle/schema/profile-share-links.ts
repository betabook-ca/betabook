import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

// One row per user, created and rotated by triggers in
// drizzle/migrations/0041_profile_share_links.sql. The token is the owner's
// consent to name them to signed-out link holders, so it must change whenever
// that consent is withdrawn.
export const profileShareLinks = sqliteTable("profile_share_links", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
});
