import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { ClimbType } from "@/lib/grades";
import type { AscentStyle, GradeFeel } from "@/lib/sends";

/** One session on a shared project. Narrower than `JournalEntry` in exactly
 * one respect: no companions. A companion tag names a friend who agreed to
 * appear on the owner's journal, not to be named to whoever holds a link —
 * they are the one party here who never saw the share dialog. Everything else
 * the owner's own timeline carries travels with the link, because creating
 * one is the owner's decision to show this project. */
export type SharedProjectSession = {
  id: number;
  entryDate: string;
  body: string | null;
  tags: string[];
};

/** What a valid link resolves to: the owner's own view of one project.
 *
 * The send travels whole — exact date, rating, suggested grade, grade feel
 * and comment. The share dialog says "your sessions, notes and send" before
 * the link exists, and that sentence is the consent this page rests on, so
 * anything added here has to stay inside what it already covers. A field a
 * climber would not expect under those three words needs the copy changed
 * first. */
export type SharedProject = {
  ownerId: string;
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
  /** ISO `YYYY-MM-DD`, or null for an undated send. Use `sent` to tell an
   * undated send apart from no send at all. */
  sentOn: string | null;
  ascentStyle: AscentStyle | null;
  rating: number | null;
  suggestedGrade: number | null;
  gradeFeel: GradeFeel | null;
  sendComment: string | null;
  sent: boolean;
};

/** Why a link did not resolve. `hidden` covers "no such token", "the pin is
 * gone" and "the owner went private" alike: a reader is never told which. */
export type SharedProjectAccess =
  | { status: "hidden"; project?: undefined }
  | { status: "expired"; project?: undefined }
  | { status: "visible"; project: SharedProject };

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

/** Which journal rows count as a session on a shared project: the same rows
 * the owner's own board counts (`projectSelect`'s aggregate in journal.ts),
 * so a session count cannot mean one thing on the card and another on the
 * page. Send commentary and ascents are included — a link publishes the send
 * itself, exact date and all, so withholding the note attached to it would
 * hide the entry the reader most expects to find. */
const sharedSessionRowsSql = sql`
  j.user_id = link.user_id AND j.climb_id = link.climb_id AND j.kind = 'session'
`;

/** The shared project, and whether the link resolves at all, in one read.
 *
 * Deriving the owner and the climb from the token row — never from the route
 * — is what keeps a link reachable to only the one project it was made for.
 *
 * Status and data come back together rather than from two statements, which
 * means the owner's name and the climb are selected even when the answer is
 * "expired". They are read into the worker and dropped; the sensitive payload
 * is the session notes, and those stay behind `getSharedProjectSessions` and
 * its own copy of the predicate. */
export async function getSharedProject(db: Database, token: string): Promise<SharedProjectAccess> {
  const row = await db.get<
    Omit<SharedProject, "sent"> & { sent: number; readable: number; ownerIsPrivate: number }
  >(sql`
    SELECT
      ${readableSql}     AS readable,
      share_owner.is_private AS ownerIsPrivate,
      share_owner.id     AS ownerId,
      share_owner.name   AS ownerName,
      share_owner.image  AS ownerImage,
      climbs.id          AS climbId,
      climbs.name        AS climbName,
      climbs.type        AS climbType,
      climbs.grade       AS climbGrade,
      climbs.broken_on   AS climbBrokenOn,
      climbs.area_id     AS areaId,
      areas.name         AS areaName,
      pin.pinned_at      AS pinnedAt,
      -- Correlated scalar subqueries, not a derived table: a derived table
      -- cannot see the enclosing query's columns, the same SQLite rule
      -- projectSelect works around by binding the owner id instead.
      (SELECT COUNT(*) FROM journal_entries j WHERE ${sharedSessionRowsSql})
        AS sessionCount,
      (SELECT MIN(j.entry_date) FROM journal_entries j WHERE ${sharedSessionRowsSql})
        AS firstSession,
      (SELECT MAX(j.entry_date) FROM journal_entries j WHERE ${sharedSessionRowsSql})
        AS lastSession,
      s.date_sent        AS sentOn,
      s.ascent_style     AS ascentStyle,
      s.rating           AS rating,
      s.suggested_grade  AS suggestedGrade,
      s.grade_feel       AS gradeFeel,
      s.comment          AS sendComment,
      s.id IS NOT NULL   AS sent
    ${shareFromSql}
    JOIN climbs ON climbs.id = link.climb_id
    JOIN areas ON areas.id = climbs.area_id
    LEFT JOIN sends s ON s.user_id = link.user_id AND s.climb_id = link.climb_id
    WHERE link.token = ${token}
  `);

  if (!row) return { status: "hidden" };
  if (row.readable !== 1) {
    // A closed profile is not an expiry, and saying so would report on the
    // owner rather than on the link.
    return { status: row.ownerIsPrivate === 1 ? "hidden" : "expired" };
  }

  const { readable: _readable, ownerIsPrivate: _ownerIsPrivate, ...project } = row;
  return { status: "visible", project: { ...project, sent: row.sent === 1 } };
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

  const rows = await db.all<{
    id: number;
    entryDate: string;
    body: string | null;
    tags: string | null;
  }>(sql`
    SELECT j.id AS id, j.entry_date AS entryDate, j.body AS body, j.tags AS tags
    ${shareFromSql}
    JOIN journal_entries j ON ${sharedSessionRowsSql}
    WHERE link.token = ${token} AND ${readableSql}
    ORDER BY j.entry_date DESC, j.id DESC
    LIMIT ${bounded}
  `);
  return rows.map((row) => ({
    id: row.id,
    entryDate: row.entryDate,
    body: row.body,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
  }));
}
