import { sqliteTable, integer, text, index, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export const areas = sqliteTable(
  "areas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Acyclic by construction, enforced in the database: the triggers in
    // drizzle/migrations/0017_area_cycle_guard.sql reject any insert or
    // parent_id update that would make an area reachable from itself.
    // Declared there rather than here because drizzle-kit doesn't model
    // triggers — nothing in this file will tell you they exist.
    parentId: integer("parent_id").references((): AnySQLiteColumn => areas.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    description: text("description"),
  },
  // areas_parent_idx is the whole tree index: every subtree and ancestor
  // query walks parent_id through a recursive CTE, and SQLite reads this as
  // a covering index for that walk.
  (t) => [index("areas_parent_idx").on(t.parentId)],
);
