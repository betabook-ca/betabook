import { and, eq, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import { journalEntries } from "@/db/schema";
import type { JournalFilter, JournalView } from "@/lib/filters/journal-filter";
import type { ClimbType } from "@/lib/grades";
import type { JournalKind } from "@/lib/journal";
import type { JournalCompanion } from "@/lib/journal-companions";
import type { ProjectShareAudience } from "@/lib/privacy";

import { journalVisibleSql, sendCommentVisibleSql } from "./content-access";
import { journalHashtagsCondition } from "./hashtag-filter";
import { companionsJsonSql } from "./journal-companions";

export type JournalEntry = {
  id: number;
  climbId: number | null;
  kind: JournalKind;
  sent: boolean;
  entryDate: string;
  body: string | null;
  tags: string[];
  companions?: JournalCompanion[];
  climbName: string | null;
  climbType: ClimbType | null;
  climbGrade: number | null;
  /** Break date of the climb, when it has been marked broken; caps the entry's date picker. */
  climbBrokenOn: string | null;
  /** Original send opinion, available only while this entry is completed. */
  reportedGrade?: number | null;
  areaId: number | null;
  areaName: string | null;
  isAscent: boolean;
  isSendComment: boolean;
};

export type JournalCursor = { entryDate: string; id: number };

export type JournalPage = {
  entries: JournalEntry[];
  hasMore: boolean;
  nextCursor: JournalCursor | null;
};

const JOURNAL_PAGE_SIZE = 20;

type JournalEntryRow = {
  id: number;
  climbId: number | null;
  kind: JournalKind;
  sent: number;
  entryDate: string;
  body: string | null;
  tags: string | null;
  companions: string;
  climbName: string | null;
  climbType: ClimbType | null;
  climbGrade: number | null;
  climbBrokenOn: string | null;
  reportedGrade: number | null;
  areaId: number | null;
  areaName: string | null;
  isAscent: number;
  isSendComment: number;
};

function toJournalEntry(row: JournalEntryRow): JournalEntry {
  return {
    ...row,
    companions: JSON.parse(row.companions) as JournalCompanion[],
    sent: row.sent === 1,
    isAscent: row.isAscent === 1,
    isSendComment: row.isSendComment === 1,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
  };
}

const IS_OPEN_PROJECT = sql`(j.kind = 'session' AND j.climb_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM sends s WHERE s.user_id = j.user_id AND s.climb_id = j.climb_id
    ))`;

const VIEW_CONDITION: Record<JournalView, SQL | null> = {
  all: null,
  sessions: sql`j.kind = 'session'`,
  training: sql`j.kind = 'training'`,
};

function visibleBody(viewerId: string | null): SQL {
  return sql`CASE WHEN j.is_send_comment = 0 OR ${sendCommentVisibleSql(viewerId, sql`j.user_id`)}
    THEN j.body ELSE NULL END`;
}

function filterConditions(filter: JournalFilter, viewerId: string | null): SQL[] {
  const view = VIEW_CONDITION[filter.view];
  const conditions: SQL[] = view ? [view] : [];

  if (filter.query) {
    conditions.push(sql`(
      instr(lower(COALESCE(climbs.name, '')), lower(${filter.query})) > 0
      OR instr(lower(COALESCE(${visibleBody(viewerId)}, '')), lower(${filter.query})) > 0
      OR instr(lower(COALESCE(j.tags, '')), lower(${filter.query})) > 0
      OR EXISTS (
        WITH RECURSIVE ancestors(id, parent_id, name) AS (
          SELECT a.id, a.parent_id, a.name FROM areas a WHERE a.id = climbs.area_id
          UNION ALL
          SELECT parent.id, parent.parent_id, parent.name
          FROM areas parent JOIN ancestors child ON parent.id = child.parent_id
        )
        SELECT 1
        FROM ancestors
        WHERE instr(lower(ancestors.name), lower(${filter.query})) > 0
      )
    )`);
  }
  if (filter.tags.length > 0) {
    conditions.push(journalHashtagsCondition(filter.tags, sql`j.tags`));
  }
  if (filter.climbId !== null) conditions.push(sql`j.climb_id = ${filter.climbId}`);
  if (filter.date) conditions.push(sql`j.entry_date = ${filter.date}`);
  else {
    if (filter.dateFrom) conditions.push(sql`j.entry_date >= ${filter.dateFrom}`);
    if (filter.dateTo) conditions.push(sql`j.entry_date <= ${filter.dateTo}`);
  }
  if (filter.year !== null) {
    conditions.push(
      sql`j.entry_date >= ${`${filter.year}-01-01`} AND j.entry_date <= ${`${filter.year}-12-31`}`,
    );
  }
  return conditions;
}

function journalEntrySelect(viewerId: string | null): SQL {
  return sql`
    SELECT
      j.id AS id,
      j.climb_id AS climbId,
      j.kind AS kind,
      j.sent AS sent,
      j.entry_date AS entryDate,
      ${visibleBody(viewerId)} AS body,
      j.tags AS tags,
      ${companionsJsonSql(viewerId, sql`j.id`)} AS companions,
      climbs.name AS climbName,
      climbs.type AS climbType,
      climbs.grade AS climbGrade,
      climbs.broken_on AS climbBrokenOn,
      reported.suggested_grade AS reportedGrade,
      climbs.area_id AS areaId,
      areas.name AS areaName,
      j.is_ascent AS isAscent, j.is_send_comment AS isSendComment
    FROM journal_entries j
    LEFT JOIN climbs ON climbs.id = j.climb_id
    LEFT JOIN areas ON areas.id = climbs.area_id
    LEFT JOIN sends reported ON reported.user_id = j.user_id AND reported.climb_id = j.climb_id AND j.sent = 1
`;
}

export async function getJournalPage(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  filter: JournalFilter,
  cursor: JournalCursor | null = null,
  pageSize: number = JOURNAL_PAGE_SIZE,
): Promise<JournalPage> {
  if (filter.friendIds.length > 0 && ownerId !== viewerId) {
    return { entries: [], hasMore: false, nextCursor: null };
  }
  const conditions = [
    sql`j.user_id = ${ownerId}`,
    journalVisibleSql(viewerId, sql`j.user_id`),
    ...filterConditions(filter, viewerId),
  ];
  if (filter.friendIds.length > 0) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM json_each(${companionsJsonSql(viewerId, sql`j.id`)}) companion_filter
      WHERE json_extract(companion_filter.value, '$.id') IN (
        SELECT value FROM json_each(${JSON.stringify(filter.friendIds)})
      )
    )`);
  }
  if (cursor) {
    conditions.push(sql`(j.entry_date, j.id) < (${cursor.entryDate}, ${cursor.id})`);
  }

  const rows = await db.all<JournalEntryRow>(sql`
    ${journalEntrySelect(viewerId)}
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY j.entry_date DESC, j.id DESC
    LIMIT ${pageSize + 1}
  `);

  const hasMore = rows.length > pageSize;
  const entries = (hasMore ? rows.slice(0, pageSize) : rows).map(toJournalEntry);
  const last = entries.at(-1);

  return {
    entries,
    hasMore,
    nextCursor: hasMore && last ? { entryDate: last.entryDate, id: last.id } : null,
  };
}

const CLIMB_JOURNAL_ENTRY_LIMIT = 4;

export async function getJournalForClimb(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  climbId: number,
  limit: number = CLIMB_JOURNAL_ENTRY_LIMIT,
): Promise<JournalEntry[]> {
  const rows = await db.all<JournalEntryRow>(sql`
    ${journalEntrySelect(viewerId)}
    WHERE j.user_id = ${ownerId} AND ${journalVisibleSql(viewerId, sql`j.user_id`)} AND j.climb_id = ${climbId}
    ORDER BY j.entry_date DESC, j.id DESC
    LIMIT ${limit}
  `);
  return rows.map(toJournalEntry);
}

export async function getAscentEntryId(
  db: Database,
  ownerId: string,
  climbId: number,
): Promise<number | undefined> {
  const row = await db.get<{ id: number | null }>(sql`
    SELECT j.id AS id
    FROM journal_entries j
    WHERE j.user_id = ${ownerId} AND j.climb_id = ${climbId} AND j.is_ascent = 1
    LIMIT 1
  `);
  return row?.id ?? undefined;
}

export async function getJournalEntry(db: Database, entryId: number, ownerId: string) {
  return db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, ownerId)))
    .get();
}

export async function hasJournalEntries(
  db: Database,
  ownerId: string,
  viewerId: string | null,
): Promise<boolean> {
  const row = await db.get<{ found: number }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM journal_entries j
      WHERE j.user_id = ${ownerId} AND ${journalVisibleSql(viewerId, sql`j.user_id`)}
    ) AS found
  `);
  return row?.found === 1;
}

export type AnalyticsSessionRow = {
  entryDate: string;
  climbType: ClimbType | null;
  count: number;
};

export async function getJournalSessionsForAnalytics(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  tags?: string[],
): Promise<AnalyticsSessionRow[]> {
  return db.all<AnalyticsSessionRow>(sql`
    SELECT
      j.entry_date AS entryDate,
      climbs.type AS climbType,
      COUNT(*) AS count
    FROM journal_entries j
    JOIN climbs ON climbs.id = j.climb_id
    WHERE j.user_id = ${ownerId} AND ${journalVisibleSql(viewerId, sql`j.user_id`)} AND j.kind = 'session'
      ${tags?.length ? sql`AND ${journalHashtagsCondition(tags, sql`j.tags`)}` : sql``}
    GROUP BY j.entry_date, climbs.type
    ORDER BY j.entry_date, climbs.type
  `);
}

/** A climb whose unsent sessions suggest it is really a project. Not what the
 * Projects tab lists — that is `PinnedProject` — only what the pin modal
 * offers, where "four sessions, no send" is the evidence worth surfacing. */
export type OpenProject = {
  climbId: number;
  climbName: string;
  climbType: ClimbType;
  climbGrade: number | null;
  climbBrokenOn: string | null;
  areaId: number;
  areaName: string;
  sessionCount: number;
  noteCount: number;
  firstSession: string;
  lastSession: string;
};

/** A climb the climber pinned, with whatever history it has accumulated.
 * `firstSession`/`lastSession` are null and `sessionCount` is 0 for a pin that
 * has never been climbed: membership comes from the pin alone, so a card with
 * no history is a supported state rather than a missing row. */
export type PinnedProject = Omit<OpenProject, "firstSession" | "lastSession"> & {
  pinnedAt: string;
  firstSession: string | null;
  lastSession: string | null;
  /** The send's date, when sent; null for an undated send. Use `sent` to tell
   * an undated send apart from no send at all. */
  sentOn: string | null;
  sent: boolean;
  /** The link the owner published for this project, if there is one. Present
   * only on the owner's own board — a token is a credential, and these reads
   * already refuse a viewer who is not the owner. */
  share: { token: string; audience: ProjectShareAudience; expiresAt: string | null } | null;
};

export const OPEN_PROJECT_PAGE_SIZE = 100;

/** Pins offered in the modal before the climber types anything. */
const OPEN_PROJECT_SUGGESTION_LIMIT = 8;

/** `ownerId` is bound inside the session aggregate rather than correlated to
 * `p.user_id`: SQLite derived tables cannot see the enclosing query's columns,
 * and the read is already scoped to one climber anyway. */
function projectSelect(ownerId: string, sent: boolean): SQL {
  return sql`
    SELECT
      p.climb_id        AS climbId,
      climbs.name       AS climbName,
      climbs.type       AS climbType,
      climbs.grade      AS climbGrade,
      climbs.broken_on  AS climbBrokenOn,
      climbs.area_id    AS areaId,
      areas.name        AS areaName,
      p.pinned_at       AS pinnedAt,
      COALESCE(agg.sessionCount, 0) AS sessionCount,
      COALESCE(agg.noteCount, 0)    AS noteCount,
      agg.firstSession  AS firstSession,
      agg.lastSession   AS lastSession,
      s.date_sent       AS sentOn,
      ${sent ? sql`1` : sql`0`} AS sent,
      share.token       AS shareToken,
      share.audience    AS shareAudience,
      share.expires_at  AS shareExpiresAt
    FROM pinned_projects p
    JOIN climbs ON climbs.id = p.climb_id
    JOIN areas ON areas.id = climbs.area_id
    LEFT JOIN sends s ON s.user_id = p.user_id AND s.climb_id = p.climb_id
    LEFT JOIN project_share_links share
      ON share.user_id = p.user_id AND share.climb_id = p.climb_id
    LEFT JOIN (
      SELECT
        j.climb_id        AS climbId,
        COUNT(*)          AS sessionCount,
        COUNT(*) FILTER (WHERE TRIM(COALESCE(j.body, '')) <> '') AS noteCount,
        MIN(j.entry_date) AS firstSession,
        MAX(j.entry_date) AS lastSession
      FROM journal_entries j
      WHERE j.user_id = ${ownerId} AND j.kind = 'session' AND j.climb_id IS NOT NULL
      GROUP BY j.climb_id
    ) agg ON agg.climbId = p.climb_id
  `;
}

/** The pinned climbs behind one Projects tab: `sent: false` for Projects,
 * `sent: true` for Sent Projects. Every pin appears in exactly one of the two,
 * so sending a climb moves its card rather than discarding the pin. */
export async function getPinnedProjects(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  { sent }: { sent: boolean },
  limit: number = OPEN_PROJECT_PAGE_SIZE,
): Promise<PinnedProject[]> {
  if (ownerId !== viewerId) return [];
  const boundedLimit = Number.isInteger(limit)
    ? Math.min(Math.max(limit, 1), OPEN_PROJECT_PAGE_SIZE + 1)
    : OPEN_PROJECT_PAGE_SIZE;

  const rows = await db.all<
    Omit<PinnedProject, "sent" | "share"> & {
      sent: number;
      shareToken: string | null;
      shareAudience: ProjectShareAudience | null;
      shareExpiresAt: string | null;
    }
  >(sql`
    ${projectSelect(ownerId, sent)}
    WHERE p.user_id = ${ownerId}
      AND ${journalVisibleSql(viewerId, sql`p.user_id`)}
      AND s.id IS ${sent ? sql`NOT NULL` : sql`NULL`}
    ORDER BY ${
      sent
        ? sql`s.date_sent IS NULL, s.date_sent DESC`
        : // SQLite sorts NULL first under DESC, which would float a pin that
          // has never been climbed above every active project; the IS NULL key
          // pushes those to the end, ordered by when they were pinned.
          sql`agg.lastSession IS NULL, agg.lastSession DESC`
    },
      p.pinned_at DESC, p.climb_id ASC
    LIMIT ${boundedLimit}
  `);
  return rows.map(({ shareToken, shareAudience, shareExpiresAt, ...row }) => ({
    ...row,
    sent: row.sent === 1,
    share:
      shareToken && shareAudience
        ? { token: shareToken, audience: shareAudience, expiresAt: shareExpiresAt }
        : null,
  }));
}

/** Sessions preloaded per project card. Older ones page in from the journal
 * API, so these rows keep the journal timeline's entry projection. */
const OPEN_PROJECT_SESSION_PRELOAD = 3;

/** Unlike the pin listing this is not partitioned by send: a sent project keeps
 * the sessions it took to get there, and they belong on its card. */
export async function getPinnedProjectSessions(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  climbIds: number[],
  perProject: number = OPEN_PROJECT_SESSION_PRELOAD,
): Promise<JournalEntry[]> {
  if (ownerId !== viewerId || climbIds.length === 0) return [];
  const bounded = Number.isInteger(perProject)
    ? Math.min(Math.max(perProject, 1), OPEN_PROJECT_SESSION_PRELOAD)
    : OPEN_PROJECT_SESSION_PRELOAD;

  const rows = await db.all<JournalEntryRow>(sql`
    WITH ranked AS (
      SELECT j.id, ROW_NUMBER() OVER (
          PARTITION BY j.climb_id ORDER BY j.entry_date DESC, j.id DESC
        ) AS seq
      FROM journal_entries j
      WHERE j.user_id = ${ownerId}
        AND ${journalVisibleSql(viewerId, sql`j.user_id`)}
        AND j.kind = 'session' AND j.climb_id IS NOT NULL
        AND j.climb_id IN (SELECT value FROM json_each(${JSON.stringify(climbIds)}))
    )
    ${journalEntrySelect(viewerId)}
    JOIN ranked ON ranked.id = j.id AND ranked.seq <= ${bounded}
    ORDER BY j.entry_date DESC, j.id DESC
  `);
  return rows.map(toJournalEntry);
}

/** Every climb the owner has pinned, both sides of the send split. The board
 * only ever holds one side, so it cannot tell the pin dialog that a climb it
 * isn't showing is already pinned — a sent project would otherwise look
 * pinnable, and picking it would close the dialog with nothing new on the
 * tab. */
export async function getPinnedClimbIds(
  db: Database,
  ownerId: string,
  viewerId: string | null,
): Promise<number[]> {
  if (ownerId !== viewerId) return [];
  const rows = await db.all<{ climbId: number }>(sql`
    SELECT climb_id AS climbId FROM pinned_projects WHERE user_id = ${ownerId}
  `);
  return rows.map((row) => row.climbId);
}

/** Climbs worth offering as a pin: worked in a session, never sent, not
 * already pinned. This is the rule that used to populate the tab outright. */
export async function getOpenProjectSuggestions(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  limit: number = OPEN_PROJECT_SUGGESTION_LIMIT,
): Promise<OpenProject[]> {
  if (ownerId !== viewerId) return [];
  const boundedLimit = Number.isInteger(limit)
    ? Math.min(Math.max(limit, 1), OPEN_PROJECT_SUGGESTION_LIMIT)
    : OPEN_PROJECT_SUGGESTION_LIMIT;

  return db.all<OpenProject>(sql`
    SELECT
      j.climb_id        AS climbId,
      climbs.name       AS climbName,
      climbs.type       AS climbType,
      climbs.grade      AS climbGrade,
      climbs.broken_on  AS climbBrokenOn,
      climbs.area_id    AS areaId,
      areas.name        AS areaName,
      COUNT(*)          AS sessionCount,
      COUNT(*) FILTER (WHERE TRIM(COALESCE(j.body, '')) <> '')
                        AS noteCount,
      MIN(j.entry_date) AS firstSession,
      MAX(j.entry_date) AS lastSession
    FROM journal_entries j
    JOIN climbs ON climbs.id = j.climb_id
    JOIN areas ON areas.id = climbs.area_id
    WHERE j.user_id = ${ownerId} AND ${journalVisibleSql(viewerId, sql`j.user_id`)} AND ${IS_OPEN_PROJECT}
      AND NOT EXISTS (
        SELECT 1 FROM pinned_projects pp
        WHERE pp.user_id = j.user_id AND pp.climb_id = j.climb_id
      )
    GROUP BY j.climb_id
    ORDER BY sessionCount DESC, lastSession DESC, j.climb_id ASC
    LIMIT ${boundedLimit}
  `);
}

/** Owner-only editing projection, including currently visible companion selections. */
export async function getJournalEntryForEdit(
  db: Database,
  entryId: number,
  ownerId: string,
): Promise<JournalEntry | null> {
  const row = await db.get<JournalEntryRow>(sql`
    ${journalEntrySelect(ownerId)}
    WHERE j.id = ${entryId} AND j.user_id = ${ownerId}
  `);
  return row ? toJournalEntry(row) : null;
}
