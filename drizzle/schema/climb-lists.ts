import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { climbs } from "./climbs";

/** A named, ordered list of climbs — "Red River classics", "Bishop wishlist".
 *
 * A list has no audience of its own. Who can open it is the owner's
 * `user.climb_list_visibility`, which covers every list they keep, or a live
 * row in `climb_list_share_links` for that one list. A copy is a new row with
 * no link back to the list it came from: it is a snapshot, not a follower. */
export const climbLists = sqliteTable(
  "climb_lists",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Plain text. */
    description: text("description"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [
    // Referenced by the composite foreign key in `climb_list_share_links`.
    // SQLite requires a unique index on the parent columns.
    uniqueIndex("climb_lists_user_id_idx").on(t.userId, t.id),
    index("climb_lists_user_updated_idx").on(t.userId, t.updatedAt),
    check("climb_lists_title", sql`length(trim(${t.title})) BETWEEN 1 AND 80`),
    // Higher than `MAX_CLIMB_LIST_DESCRIPTION` on purpose. SQLite can't alter
    // a CHECK, so the real limit is in lib/climb-lists.ts.
    check(
      "climb_lists_description",
      sql`${t.description} IS NULL OR length(${t.description}) <= 5000`,
    ),
  ],
);

/** One climb on one list, at the owner's position. Viewers may sort a list
 * by grade, area, name or date added, but that is a view: only
 * `saveClimbListEdits` writes `position`.
 *
 * Like a project pin, an item is a bookmark that carries nothing worth keeping
 * once its climb is gone, so deleting the climb deletes it. A moderator merge
 * moves it to the surviving climb first (actions/moderation-apply.ts). */
export const climbListItems = sqliteTable(
  "climb_list_items",
  {
    listId: integer("list_id")
      .notNull()
      .references(() => climbLists.id, { onDelete: "cascade" }),
    climbId: integer("climb_id")
      .notNull()
      .references(() => climbs.id, { onDelete: "cascade" }),
    /** 1-based order. Gaps are harmless; reads order by it, then `added_at`. */
    position: integer("position").notNull(),
    addedAt: integer("added_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    // Adding a climb that is already on the list is ON CONFLICT DO NOTHING.
    primaryKey({ columns: [t.listId, t.climbId] }),
    index("climb_list_items_climb_idx").on(t.climbId),
  ],
);
