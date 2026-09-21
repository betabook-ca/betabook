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
 * There is no audience column, deliberately. A link is a link: whoever holds
 * it can open it, signed in or not. Putting Friends or Members on it would
 * dress a URL up as the journal's audience setting, which is a different
 * mechanism with different rules — that one decides who sees an entry in a
 * feed, this one decides nothing except whether a given URL still answers.
 * Conflating them is how someone shares "with friends" and is surprised by
 * either half of the result. The controls here are the two a link can honestly
 * offer: an `expires_at` written by `datetime('now', …)`, and deleting the row.
 *
 * The token is the whole credential and the whole URL — no user or climb id in
 * it, nothing to enumerate, and nothing revealed until it resolves.
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
    // One share per project, so changing the expiry is an upsert on this key
    // and the link already sent out keeps working. Doubles as the child-side
    // index the cascade needs.
    uniqueIndex("project_share_links_project_idx").on(t.userId, t.climbId),
    // Comparing against datetime('now') is string comparison, so one ISO
    // 'YYYY-MM-DDTHH:MM:SSZ' write would silently make a link permanent.
    check(
      "project_share_links_expires_at_format",
      sql`${t.expiresAt} IS NULL OR ${t.expiresAt} = datetime(${t.expiresAt})`,
    ),
  ],
);
