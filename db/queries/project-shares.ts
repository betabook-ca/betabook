import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { ClimbType } from "@/lib/grades";

/** One session on a shared project. Deliberately narrower than `JournalEntry`:
 * no entry id (ids reach the RSC payload through React keys), no companions
 * (they name friends who never agreed to this link), and no climb columns,
 * since every row is the same climb. */
export type SharedProjectSession = {
  entryDate: string;
  body: string | null;
  tags: string[];
};

/** What a valid link resolves to. The send is a month rather than a date: the
 * signed-out climb page already lists the latest sends with a month-only date
 * and no name, so publishing "<owner> sent <climb> on the 14th" here would let
 * a reader pick their row out of that list and attribute its rating and
 * suggested grade — both of which need a session everywhere else. */
export type SharedProject = {
  ownerName: string;
  ownerImage: string | null;
  climbId: number;
  climbName: string;
  climbType: ClimbType;
  climbGrade: number | null;
  climbBrokenOn: string | null;
  areaId: number;
  areaName: string;
  pinnedAt: string;
  sessionCount: number;
  firstSession: string | null;
  lastSession: string | null;
  /** `YYYY-MM`, or null for an undated send. Use `sent` to tell the two apart. */
  sentMonth: string | null;
  sent: boolean;
};

/** Why a link did not resolve. `hidden` covers "no such token", "the pin is
 * gone" and "the owner went private" alike: a reader is never told which,
 * though in practice only someone who was given the link ever asks. */
export type ProjectShareAccess = { status: "hidden" | "expired" | "visible" };

/**
 * What makes a link readable, as conditions over an aliased `link` row.
 *
 * There is no viewer in it, and that is the design: a project link carries no
 * audience, so holding the URL is the whole of the permission. What can still
 * revoke it lives here instead — the deadline passing, and the owner having
 * gone private. Both are read inside the statement rather than trusted from
 * page props, so a link stops answering on the next load rather than whenever
 * some cache happens to turn over.
 *
 * The private check is belt and braces: the trigger in migration 0048 deletes
 * every row when a profile closes, so a row should not survive to be caught
 * here. It covers the one case the trigger cannot — a share written in the
 * same moment the profile was closing.
 */
const readableSql = sql`
  share_owner.is_private = 0
  -- NULL > datetime('now') is NULL, not true, so the null branch is explicit.
  AND (link.expires_at IS NULL OR link.expires_at > datetime('now'))
`;

/** The pin join is what ties a link to a project that still exists. The
 * composite foreign key already guarantees it, and the join is here anyway so
 * correctness never rests on foreign keys being enforced. */
const shareFromSql = sql`
  FROM project_share_links link
  JOIN pinned_projects pin ON pin.user_id = link.user_id AND pin.climb_id = link.climb_id
  JOIN user share_owner ON share_owner.id = link.user_id
`;

/** Which journal rows count as a session on a shared project.
 *
 * `is_send_comment` rows are excluded rather than blanked. They are not
 * sessions the climber logged: `applyClimbMerge` inserts one dated to the day
 * of the merge to preserve a colliding send comment, so including them would
 * put a bodyless "session" on a stranger's page dated to a moderation action,
 * and inflate the count beside it. Excluding them also keeps send commentary,
 * which has its own audience, out of a surface that does not read it. */
const sharedSessionRowsSql = sql`
  j.user_id = link.user_id AND j.climb_id = link.climb_id
    AND j.kind = 'session' AND j.is_send_comment = 0
`;

/** Resolves a token to an outcome without reading a single fact about the
 * owner or the climb, so the page can choose between a 404 and an expiry
 * notice before anything sensitive is selected. */
export async function getProjectShareAccess(
  db: Database,
  token: string,
): Promise<ProjectShareAccess> {
  const row = await db.get<{ readable: number; ownerIsPrivate: number }>(sql`
    SELECT ${readableSql} AS readable, share_owner.is_private AS ownerIsPrivate
    ${shareFromSql}
    WHERE link.token = ${token}
  `);

  if (!row) return { status: "hidden" };
  if (row.readable === 1) return { status: "visible" };
  // A closed profile is not an expiry, and saying so would report on the
  // owner rather than on the link.
  return row.ownerIsPrivate === 1 ? { status: "hidden" } : { status: "expired" };
}

/** The shared project itself. Re-applies the whole predicate rather than
 * trusting `getProjectShareAccess`, and derives the owner and the climb from
 * the token row — never from the route — so a link can only ever reach the one
 * project it was made for. */
export async function getSharedProject(db: Database, token: string): Promise<SharedProject | null> {
  const row = await db.get<Omit<SharedProject, "sent"> & { sent: number }>(sql`
    SELECT
      share_owner.name  AS ownerName,
      share_owner.image AS ownerImage,
      climbs.id         AS climbId,
      climbs.name       AS climbName,
      climbs.type       AS climbType,
      climbs.grade      AS climbGrade,
      climbs.broken_on  AS climbBrokenOn,
      climbs.area_id    AS areaId,
      areas.name        AS areaName,
      pin.pinned_at     AS pinnedAt,
      -- Correlated scalar subqueries, not a derived table: a derived table
      -- cannot see the enclosing query's columns, the same SQLite rule
      -- projectSelect works around by binding the owner id instead.
      (SELECT COUNT(*) FROM journal_entries j WHERE ${sharedSessionRowsSql})
        AS sessionCount,
      (SELECT MIN(j.entry_date) FROM journal_entries j WHERE ${sharedSessionRowsSql})
        AS firstSession,
      (SELECT MAX(j.entry_date) FROM journal_entries j WHERE ${sharedSessionRowsSql})
        AS lastSession,
      substr(s.date_sent, 1, 7) AS sentMonth,
      s.id IS NOT NULL  AS sent
    ${shareFromSql}
    JOIN climbs ON climbs.id = link.climb_id
    JOIN areas ON areas.id = climbs.area_id
    LEFT JOIN sends s ON s.user_id = link.user_id AND s.climb_id = link.climb_id
    WHERE link.token = ${token} AND ${readableSql}
  `);
  return row ? { ...row, sent: row.sent === 1 } : null;
}

const SHARED_PROJECT_SESSIONS = 20;

/** The sessions behind a shared project, newest first, under the same
 * predicate as everything else. Bounded rather than paginated: a public
 * endpoint that took a cursor would be a second door onto this data, and the
 * page is a summary, not the climber's journal. */
export async function getSharedProjectSessions(
  db: Database,
  token: string,
  limit: number = SHARED_PROJECT_SESSIONS,
): Promise<SharedProjectSession[]> {
  const bounded = Number.isInteger(limit)
    ? Math.min(Math.max(limit, 1), SHARED_PROJECT_SESSIONS)
    : SHARED_PROJECT_SESSIONS;

  const rows = await db.all<{ entryDate: string; body: string | null; tags: string | null }>(sql`
    SELECT j.entry_date AS entryDate, j.body AS body, j.tags AS tags
    ${shareFromSql}
    JOIN journal_entries j ON ${sharedSessionRowsSql}
    WHERE link.token = ${token} AND ${readableSql}
    ORDER BY j.entry_date DESC, j.id DESC
    LIMIT ${bounded}
  `);
  return rows.map((row) => ({
    entryDate: row.entryDate,
    body: row.body,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
  }));
}

/** The owner's own view of a link, for the card and the dialog. Scoped to the
 * owner: this is the only read that hands out a token, and a token is the
 * credential. */
export async function getProjectShareForOwner(
  db: Database,
  ownerId: string,
  climbId: number,
): Promise<{ token: string; expiresAt: string | null } | null> {
  const row = await db.get<{ token: string; expiresAt: string | null }>(sql`
    SELECT token, expires_at AS expiresAt
    FROM project_share_links WHERE user_id = ${ownerId} AND climb_id = ${climbId}
  `);
  return row ?? null;
}

/** Every live token a climber holds. Read before a write that destroys them —
 * going private deletes the rows through a trigger, so the paths to purge have
 * to be collected first. */
export async function getProjectShareTokens(db: Database, ownerId: string): Promise<string[]> {
  const rows = await db.all<{ token: string }>(sql`
    SELECT token FROM project_share_links WHERE user_id = ${ownerId}
  `);
  return rows.map((row) => row.token);
}
