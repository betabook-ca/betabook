import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

export const featureAnnouncementDismissals = sqliteTable(
  "feature_announcement_dismissals",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    featureId: text("feature_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.featureId] })],
);
