import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, index, primaryKey } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { climbs } from "./climbs";

/** A climb the climber deliberately marked as a project. This is the sole
 * source of the Projects and Sent tabs: before it existed, a
 * project was inferred from "logged a session, never sent it", which swept up
 * every warm-up and one-off attempt. Sessions and sends still supply a card's
 * contents, but never its membership — a pin with no sessions at all is a
 * valid, intentional row.
 *
 * Unlike `sends`, which restricts climb deletion because a send is historical
 * data, a pin is a bookmark: it carries nothing that outlives its climb, so
 * both sides cascade. */
export const pinnedProjects = sqliteTable(
  "pinned_projects",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    climbId: integer("climb_id")
      .notNull()
      .references(() => climbs.id, { onDelete: "cascade" }),
    // ISO date (YYYY-MM-DD) the pin was created, in UTC. Orders a pin that has
    // no sessions to date it, so the board can still sort those sensibly.
    pinnedAt: text("pinned_at")
      .notNull()
      .default(sql`(date('now'))`),
  },
  (t) => [
    // Doubles as the per-user listing index and the uniqueness that makes a
    // repeated pin an ON CONFLICT DO NOTHING no-op rather than a duplicate row.
    primaryKey({ columns: [t.userId, t.climbId] }),
    index("pinned_projects_climb_idx").on(t.climbId),
  ],
);
