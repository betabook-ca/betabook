import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

export const userProductTours = sqliteTable(
  "user_product_tours",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tourId: text("tour_id").notNull(),
    version: integer("version").notNull(),
    status: text("status", { enum: ["dismissed", "completed"] }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tourId] })],
);
