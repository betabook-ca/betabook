import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { AnalyticsLayout } from "@/lib/analytics-layout";

import { user } from "./auth";

export const userAnalyticsLayouts = sqliteTable("user_analytics_layouts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  layout: text("layout", { mode: "json" }).$type<AnalyticsLayout>().notNull(),
});
