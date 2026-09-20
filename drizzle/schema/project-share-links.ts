import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { pinnedProjects } from "./pinned-projects";

/** One climber's decision to show one of their projects to someone outside the
 * Projects tab, which is otherwise owner-only.
 *
 * Two controls make that safe to offer, and both are enforced inside every
 * read statement rather than at page level: `audience` says who may open the
 * link, and `expires_at` says for how long. The token is the link; there is no
 * user or climb id in the URL, so a share reveals nothing until it resolves.
 *
 * A share grants MORE than the owner's blanket `journal_visibility` for this
 * one climb's session notes — that is the feature, not an oversight. It grants
 * nothing else: send commentary keeps its own audience, companion tags are
 * left out because they name third parties who never agreed to this link, and
 * no other climb is reachable through it.
 *
 * The composite foreign key is the invariant that matters: a share cannot
 * outlive the pin it describes. Untracking the project, deleting the climb and
 * deleting the account all take the link with them. The second key to `user`
 * is redundant through that path and kept anyway, so an orphan cannot survive
 * a manual `pinned_projects` repair. */
export const projectShareLinks = sqliteTable(
  "project_share_links",
  {
    // A rowid table's text primary key is nullable unless it says otherwise,
    // and a NULL token would be a link that matches nothing.
    token: text("token")
      .primaryKey()
      .notNull()
      .default(sql`(lower(hex(randomblob(16))))`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    climbId: integer("climb_id").notNull(),
    /** `public` is the stored value for Members, as everywhere else in the
     * app; `everyone` is the one that reaches signed-out readers. */
    audience: text("audience").notNull(),
    /** UTC `YYYY-MM-DD HH:MM:SS`, or null for a link that does not expire.
     * Written by `datetime('now', …)` so the deadline comes from the database
     * rather than from an unsynced client clock. */
    expiresAt: text("expires_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    foreignKey({
      columns: [t.userId, t.climbId],
      foreignColumns: [pinnedProjects.userId, pinnedProjects.climbId],
    }).onDelete("cascade"),
    // One share per project, so changing the audience or the expiry is an
    // upsert on this key and the link already sent out keeps working. Doubles
    // as the child-side index the cascade needs.
    uniqueIndex("project_share_links_project_idx").on(t.userId, t.climbId),
    check("project_share_links_audience", sql`${t.audience} IN ('everyone', 'public', 'friends')`),
    // Comparing against datetime('now') is string comparison, so one ISO
    // 'YYYY-MM-DDTHH:MM:SSZ' write would silently make a link permanent.
    check(
      "project_share_links_expires_at_format",
      sql`${t.expiresAt} IS NULL OR ${t.expiresAt} = datetime(${t.expiresAt})`,
    ),
  ],
);
