import { and, eq, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import { journalEntries } from "@/db/schema";
import type { JournalFilter, JournalView } from "@/lib/filters/journal-filter";
import type { ClimbType } from "@/lib/grades";
import type { JournalKind } from "@/lib/journal";
import type { JournalCompanion } from "@/lib/journal-companions";

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
      climbs.area_id AS areaId,
      areas.name AS areaName,
      j.is_ascent AS isAscent, j.is_send_comment AS isSendComment
    FROM journal_entries j
    LEFT JOIN climbs ON climbs.id = j.climb_id
    LEFT JOIN areas ON areas.id = climbs.area_id
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

/** Whether the viewer can read any entry in this journal. */
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

export type OpenProject = {
  climbId: number;
  climbName: string;
  climbType: ClimbType;
  climbGrade: number | null;
  areaId: number;
  areaName: string;
  sessionCount: number;
  /** Sessions that actually carry a written note — what the card's notes
   * toggle is worth opening for. */
  noteCount: number;
  firstSession: string;
  lastSession: string;
};

export const OPEN_PROJECT_PAGE_SIZE = 100;

export async function getOpenProjects(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  limit: number = OPEN_PROJECT_PAGE_SIZE,
): Promise<OpenProject[]> {
  if (ownerId !== viewerId) return [];
  const boundedLimit = Number.isInteger(limit)
    ? Math.min(Math.max(limit, 1), OPEN_PROJECT_PAGE_SIZE + 1)
    : OPEN_PROJECT_PAGE_SIZE;

  return db.all<OpenProject>(sql`
    SELECT
      j.climb_id        AS climbId,
      climbs.name       AS climbName,
      climbs.type       AS climbType,
      climbs.grade      AS climbGrade,
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
    GROUP BY j.climb_id
    ORDER BY lastSession DESC, j.climb_id ASC
    LIMIT ${boundedLimit}
  `);
}

/** Sessions carried with each project card. Three is what a card needs to
 * show its latest note and open a short history with no request at all; a
 * longer project pages the rest in from the journal API when opened. */
const OPEN_PROJECT_SESSION_PRELOAD = 3;

/** The most recent sessions on each of `climbIds`, ranked per climb in one
 * pass — a projects list would otherwise need a query per card before it
 * could show a single note. Same owner-only gate as the projects it
 * annotates, and the same entry projection as the journal timeline, so the
 * client can page older sessions straight onto these from the journal API. */
export async function getOpenProjectSessions(
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
        climbs.area_id AS areaId,
        areas.name AS areaName,
        j.is_ascent AS isAscent,
        j.is_send_comment AS isSendComment,
        ROW_NUMBER() OVER (
          PARTITION BY j.climb_id ORDER BY j.entry_date DESC, j.id DESC
        ) AS seq
      FROM journal_entries j
      JOIN climbs ON climbs.id = j.climb_id
      JOIN areas ON areas.id = climbs.area_id
      WHERE j.user_id = ${ownerId}
        AND ${journalVisibleSql(viewerId, sql`j.user_id`)}
        AND ${IS_OPEN_PROJECT}
        AND j.climb_id IN (SELECT value FROM json_each(${JSON.stringify(climbIds)}))
    )
    SELECT
      id, climbId, kind, sent, entryDate, body, tags, companions,
      climbName, climbType, climbGrade, areaId, areaName, isAscent, isSendComment
    FROM ranked
    WHERE seq <= ${bounded}
    ORDER BY entryDate DESC, id DESC
  `);
  return rows.map(toJournalEntry);
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
