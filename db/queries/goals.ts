import { sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import { goalCompletions, goalProgress, goals } from "@/db/schema";
import { summarizeGoalPeriods, goalHistoryWindow } from "@/lib/goal-history";
import {
  goalToday,
  goalWindow,
  type GoalPage,
  type GoalProgress,
  type GoalContribution,
} from "@/lib/goals";
import { nativeGradeArray } from "@/lib/grades";

import { journalVisibleSql } from "./content-access";
import { goalAchievementStatements, unseenGoalAchievements } from "./goal-achievements";

function contributionKey() {
  return sql`CASE g.kind WHEN 'training' THEN j.id WHEN 'days' THEN j.entry_date WHEN 'new-areas' THEN c.area_id ELSE j.climb_id END`;
}
// Milestone eligibility is checked when saved; later imports must not invalidate it.
function matches(start: SQL, end: SQL) {
  return sql`j.user_id = g.user_id AND j.entry_date BETWEEN ${start} AND ${end}
    AND NOT EXISTS (SELECT 1 FROM json_each(g.tags) wanted WHERE NOT EXISTS (
      SELECT 1 FROM json_each(j.tags) actual WHERE actual.value=wanted.value
    )) AND (
    (g.kind = 'training' AND j.kind = 'training') OR
    (g.kind = 'days' AND j.kind = 'session') OR
    (g.kind = 'new-areas' AND j.kind = 'session' AND NOT EXISTS (
      SELECT 1 FROM journal_entries old_j JOIN climbs old_c ON old_c.id = old_j.climb_id
      WHERE old_j.user_id = g.user_id AND old_c.area_id = c.area_id AND old_j.entry_date < ${start}
    )) OR
    (g.kind IN ('volume','grade') AND j.is_ascent = 1 AND c.type = g.discipline
      AND (g.grade IS NULL OR c.grade = g.grade OR ((g.grade_match = 'at-least' OR g.kind = 'grade') AND c.grade >= g.grade)))
  )`;
}
/** Correlated to goals g. Used in the same SQL statement as writes so concurrent creates cannot exceed the cap. */
export function goalCountSql(useProjection = true) {
  const live = sql`(SELECT count(DISTINCT ${contributionKey()}) FROM journal_entries j LEFT JOIN climbs c ON c.id = j.climb_id WHERE ${matches(sql`g.start_date`, sql`g.end_date`)})`;
  if (!useProjection) return live;
  return sql`COALESCE((SELECT p.progress FROM goal_progress p WHERE p.goal_id=g.id
    AND p.period_start=g.start_date AND p.period_end=g.end_date AND p.repeat='none'
    AND g.repeat='none' AND g.progress_dirty=0), ${live})`;
}
const goalStorageColumns = sql`g.id,g.user_id,g.kind,g.target,g.discipline,g.grade,g.timeframe,g.repeat,g.start_date,g.end_date,g.timezone,g.grade_match,g.tags,g.recurring_end_date`;
const goalColumns = sql`g.id, g.user_id AS userId, g.kind, g.target, g.discipline, g.grade, g.timeframe, g.repeat, g.start_date AS startDate, g.end_date AS endDate, g.timezone, g.grade_match AS gradeMatch, g.tags, (SELECT archived.archive_token IS NOT NULL FROM goals archived WHERE archived.id=g.id) AS archived, (SELECT recurring_end_date FROM goals current WHERE current.id=g.id) AS recurringEndDate`;

async function goalPeriodsQuery(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  now = new Date(),
  options: { goalId?: number; activeOnly?: boolean; from?: string; until?: string } = {},
) {
  const goalFilter = options.goalId === undefined ? sql`1` : sql`g.id = ${options.goalId}`;
  const zones = await db.all<{ timezone: string }>(
    sql`SELECT DISTINCT g.timezone FROM goals g WHERE g.user_id=${ownerId} AND ${goalFilter} AND ${journalVisibleSql(viewerId, sql`g.user_id`)} UNION SELECT h.timezone FROM goal_periods h JOIN goals g ON g.id=h.goal_id WHERE g.user_id=${ownerId} AND ${goalFilter} AND ${journalVisibleSql(viewerId, sql`g.user_id`)}`,
  );
  if (zones.length === 0) return null;
  const dates = JSON.stringify(
    Object.fromEntries(zones.map(({ timezone }) => [timezone, goalToday(timezone, now)])),
  );
  // A zone introduced concurrently must yield retryable rows, not an empty active view.
  const knownToday = sql`json_extract(${dates}, '$."' || g.timezone || '"')`;
  const today = sql`COALESCE(${knownToday}, ${now.toISOString().slice(0, 10)})`;
  const lower = options.activeOnly
    ? today
    : options.from
      ? sql`${options.from}`
      : sql`g.start_date`;
  const weekSkip = sql`max(0,CAST((julianday(${lower})-julianday(g.start_date))/7 AS INTEGER))*7`;
  const monthSkip = sql`max(0,(CAST(strftime('%Y',${lower}) AS INTEGER)-CAST(strftime('%Y',g.start_date) AS INTEGER))*12+CAST(strftime('%m',${lower}) AS INTEGER)-CAST(strftime('%m',g.start_date) AS INTEGER))`;
  const start = sql`CASE g.repeat WHEN 'week' THEN date(g.start_date,'+'||(${weekSkip})||' days') WHEN 'month' THEN date(g.start_date,'+'||(${monthSkip})||' months') WHEN 'year' THEN date(g.start_date,'+'||CAST((${monthSkip})/12 AS INTEGER)||' years') ELSE g.start_date END`;
  const stop = sql`COALESCE(g.recurring_end_date, '9999-12-31')`;
  const end = sql`min(${stop}, CASE g.repeat WHEN 'week' THEN date(${start},'+6 days') WHEN 'month' THEN date(${start},'+1 month','-1 day') WHEN 'year' THEN date(${start},'+1 year','-1 day') ELSE g.end_date END)`;
  const range = options.activeOnly
    ? sql`(g.repeat='none' OR ${knownToday} IS NULL OR (g.ps<=${today} AND g.pe>=${today}))`
    : options.from && options.until
      ? sql`g.ps>=${options.from} AND g.ps<${options.until}`
      : sql`1`;
  const definitions = sql`
    WITH RECURSIVE periods AS (
      SELECT ${goalStorageColumns}, ${start} AS ps, ${end} AS pe FROM goals g
      WHERE g.user_id=${ownerId} AND ${goalFilter} AND ${journalVisibleSql(viewerId, sql`g.user_id`)} AND ${start}<=${stop}
      UNION ALL
      SELECT ${goalStorageColumns},
        date(g.pe,'+1 day'), min(${stop}, CASE g.repeat WHEN 'week' THEN date(g.pe,'+7 days') WHEN 'year' THEN date(g.pe,'+1 day','+1 year','-1 day') ELSE date(g.pe,'+1 day','+1 month','-1 day') END)
      FROM periods g WHERE g.repeat <> 'none' AND g.pe < ${today} AND g.pe < ${stop} AND ${options.until ? sql`g.pe < ${options.until}` : sql`1`}
    ), all_periods AS (
      SELECT g.* FROM periods g WHERE NOT EXISTS (SELECT 1 FROM goal_periods h WHERE h.goal_id=g.id AND h.start_date=g.ps AND h.repeat=g.repeat)
      UNION ALL
      SELECT g.id,g.user_id,h.kind,h.target,h.discipline,h.grade,h.repeat,h.repeat,h.start_date,h.end_date,h.timezone,h.grade_match,h.tags,g.recurring_end_date,h.start_date,h.end_date
      FROM goal_periods h JOIN goals g ON g.id=h.goal_id WHERE g.user_id=${ownerId} AND ${goalFilter} AND ${journalVisibleSql(viewerId, sql`g.user_id`)}
    ), scoped_periods AS (SELECT g.* FROM all_periods g WHERE ${range})`;
  const validProgress = sql`live.progress_dirty=0 AND p.goal_id IS NOT NULL AND p.period_end=g.pe`;
  const joins = sql`FROM scoped_periods g JOIN goals live ON live.id=g.id
    LEFT JOIN goal_progress p ON p.goal_id=g.id AND p.period_start=g.ps AND p.repeat=g.repeat`;
  const cachedQuery = sql`${definitions}
    SELECT ${goalColumns},json_extract(${dates}, '$."' || live.timezone || '"') AS today,g.ps AS periodStart,g.pe AS periodEnd,COALESCE(p.progress,0) AS progress,
      p.completed_date AS completedDate,
      COALESCE((${validProgress} AND ${knownToday} IS NOT NULL AND json_extract(live.progress_dates, '$."' || g.timezone || '"')>=${knownToday}),0) AS cacheFresh
    ${joins} WHERE ${journalVisibleSql(viewerId, sql`g.user_id`)} ORDER BY g.pe DESC,g.id DESC`;
  const query = sql`${definitions}, counted_periods AS MATERIALIZED (
      SELECT g.* FROM scoped_periods g WHERE NOT EXISTS (
        SELECT 1 FROM goal_progress p JOIN goals live ON live.id=p.goal_id
        WHERE p.goal_id=g.id AND p.period_start=g.ps AND p.repeat=g.repeat AND ${validProgress}
      )
    ), contributions AS (
      SELECT g.id, g.ps, g.repeat, ${contributionKey()} AS item, min(j.entry_date) AS entryDate
      FROM counted_periods g JOIN journal_entries j LEFT JOIN climbs c ON c.id = j.climb_id
      WHERE ${matches(sql`g.ps`, sql`g.pe`)} GROUP BY g.id,g.ps,g.repeat,item
    ), ranked AS (
      SELECT *,row_number() OVER (PARTITION BY id,ps,repeat ORDER BY entryDate,item) AS ordinal FROM contributions
    ), totals AS (
      SELECT g.id,g.ps,g.repeat,count(r.item) AS progress,max(CASE WHEN r.ordinal = g.target THEN r.entryDate END) AS completedDate
      FROM scoped_periods g LEFT JOIN ranked r ON r.id = g.id AND r.ps = g.ps AND r.repeat = g.repeat GROUP BY g.id,g.ps,g.repeat
    )
    SELECT ${goalColumns},json_extract(${dates}, '$."' || live.timezone || '"') AS today, g.ps AS periodStart,g.pe AS periodEnd,
      CASE WHEN ${validProgress} THEN p.progress ELSE COALESCE(t.progress,0) END AS progress,
      CASE WHEN ${validProgress} THEN p.completed_date ELSE t.completedDate END AS completedDate
    ${joins} JOIN totals t ON t.id = g.id AND t.ps = g.ps AND t.repeat = g.repeat
    WHERE ${journalVisibleSql(viewerId, sql`g.user_id`)}
    ORDER BY g.pe DESC,g.id DESC
  `;
  return { query, cachedQuery, dates };
}

type GoalRow = Omit<GoalProgress, "tags"> & { tags: string; cacheFresh?: number };
function readGoalRows(rows: GoalRow[]): GoalProgress[] {
  return rows.map(({ cacheFresh: _cacheFresh, ...goal }) => ({
    ...goal,
    tags: JSON.parse(goal.tags) as string[],
    archived: Boolean(goal.archived),
  }));
}

async function getGoalPeriods(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  now = new Date(),
  options: { goalId?: number; activeOnly?: boolean; from?: string; until?: string } = {},
): Promise<GoalProgress[]> {
  let source = await goalPeriodsQuery(db, ownerId, viewerId, now, options);
  if (!source) return [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    // Counts and freshness share one SQL snapshot, including current privacy.
    const rows = await db.all<GoalRow>(source.cachedQuery);
    if (rows.every((row) => row.cacheFresh === 1)) return readGoalRows(rows);
    // Visitors may read current counts, but must not initialize owner notices.
    if (viewerId !== ownerId) {
      const current = await goalPeriodsQuery(db, ownerId, viewerId, now, options);
      return current ? readGoalRows(await db.all<GoalRow>(current.query)) : [];
    }
    try {
      await persistGoalCompletions(db, ownerId, now, {
        source: Object.keys(options).length === 0 ? source : undefined,
        ids: [...new Set(rows.filter((row) => row.cacheFresh !== 1).map((row) => row.id))],
      });
    } catch (error) {
      console.error("Could not persist goal progress; returning live counts", error);
      const current = await goalPeriodsQuery(db, ownerId, viewerId, now, options);
      return current ? readGoalRows(await db.all<GoalRow>(current.query)) : [];
    }
    source = await goalPeriodsQuery(db, ownerId, viewerId, now, options);
    if (!source) return [];
  }
  // Continued concurrent writes cannot force an unbounded retry loop.
  return readGoalRows(await db.all<GoalRow>(source.query));
}

export async function getGoalPage(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  view: "active" | "completed",
  offset = 0,
  now = new Date(),
  year?: number,
): Promise<GoalPage> {
  const periods = await getGoalPeriods(db, ownerId, viewerId, now, {
    activeOnly: view === "active",
  });
  const page = summarizeGoalPeriods(periods, view, offset, now, year);
  if (view === "completed" && viewerId === ownerId) {
    page.celebrations = await unseenGoalAchievements(db, ownerId, periods, now);
  }
  return page;
}

/** Share projected progress between both Goals views. */
export async function getGoalOverview(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  now = new Date(),
) {
  const periods = await getGoalPeriods(db, ownerId, viewerId, now);
  const active = summarizeGoalPeriods(periods, "active", 0, now);
  const completed = summarizeGoalPeriods(periods, "completed", 0, now);
  if (viewerId === ownerId) {
    completed.celebrations = await unseenGoalAchievements(db, ownerId, periods, now);
  }
  return { active, completed };
}

export async function getRecurringGoalHistory(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  goalId: number,
  offset = 0,
  now = new Date(),
  anchorMonth?: string,
) {
  const definitions = await db.all<GoalProgress & { priority: number }>(sql`
    SELECT ${goalColumns},g.start_date AS periodStart,min(g.end_date,COALESCE(g.recurring_end_date,g.end_date)) AS periodEnd,0 AS progress,NULL AS completedDate,0 AS priority FROM goals g
    WHERE g.id=${goalId} AND g.user_id=${ownerId} AND ${journalVisibleSql(viewerId, sql`g.user_id`)}
    UNION ALL
    SELECT g.id,g.user_id,h.kind,h.target,h.discipline,h.grade,h.repeat,h.repeat,h.start_date,h.end_date,h.timezone,h.grade_match,h.tags,(g.archive_token IS NOT NULL),g.recurring_end_date,h.start_date,h.end_date,0,NULL,1
    FROM goal_periods h JOIN goals g ON g.id=h.goal_id WHERE g.id=${goalId} AND g.user_id=${ownerId}
      AND (h.start_date=(SELECT min(start_date) FROM goal_periods WHERE goal_id=${goalId}) OR h.start_date=(SELECT max(start_date) FROM goal_periods WHERE goal_id=${goalId}))
      AND ${journalVisibleSql(viewerId, sql`g.user_id`)} ORDER BY priority,periodStart DESC`);
  const current = definitions.find((row) => row.priority === 0);
  const metadata = [...definitions];
  if (current && current.repeat !== "none") {
    const today = goalToday(current.timezone, now);
    const lastDay =
      current.recurringEndDate && current.recurringEndDate < today
        ? current.recurringEndDate
        : today;
    const window = goalWindow(current.repeat, lastDay, current.endDate);
    if (current.recurringEndDate && window.endDate > current.recurringEndDate)
      window.endDate = current.recurringEndDate;
    metadata.push({ ...current, periodStart: window.startDate, periodEnd: window.endDate });
  }
  const cadence =
    current?.repeat !== "none"
      ? current?.repeat
      : definitions.find((row) => row.repeat !== "none")?.repeat;
  const { from, until, ...page } = goalHistoryWindow(
    metadata,
    cadence ?? "week",
    offset,
    now,
    anchorMonth,
  );
  const periods =
    from < until ? await getGoalPeriods(db, ownerId, viewerId, now, { goalId, from, until }) : [];
  return { ...page, periods };
}

export async function getGoalContributions(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  goalId: number,
  periodStart: string,
  now = new Date(),
  periodEnd?: string,
): Promise<GoalContribution[]> {
  const until = new Date(`${periodStart}T12:00:00Z`);
  if (Number.isNaN(until.valueOf())) return [];
  until.setUTCDate(until.getUTCDate() + 1);
  const periods = await getGoalPeriods(db, ownerId, viewerId, now, {
    goalId,
    from: periodStart,
    until: until.toISOString().slice(0, 10),
  });
  const candidates = periods.filter(
    (period) =>
      period.periodStart === periodStart &&
      (periodEnd === undefined || period.periodEnd === periodEnd),
  );
  const goal = candidates.length === 1 ? candidates[0] : undefined;
  if (
    !goal ||
    goal.kind === "training" ||
    goal.kind === "days" ||
    periodStart > goalToday(goal.timezone, now)
  )
    return [];
  return db.all<GoalContribution>(sql`SELECT ${goal.kind === "new-areas" ? sql`c.area_id` : sql`c.id`} AS id,
    ${goal.kind === "new-areas" ? sql`a.name` : sql`c.name`} AS name,
    ${goal.kind === "new-areas" ? "area" : "climb"} AS type
    FROM (SELECT ${goal.id} AS id,${goal.userId} AS user_id,${goal.kind} AS kind,${goal.discipline} AS discipline,${goal.grade} AS grade,${goal.gradeMatch ?? "exact"} AS grade_match,${JSON.stringify(goal.tags ?? [])} AS tags,${goal.periodStart} AS start_date,${goal.periodEnd} AS end_date) g JOIN journal_entries j LEFT JOIN climbs c ON c.id = j.climb_id LEFT JOIN areas a ON a.id = c.area_id
    WHERE g.id = ${goalId} AND g.user_id = ${ownerId} AND ${journalVisibleSql(viewerId, sql`g.user_id`)} AND ${matches(sql`g.start_date`, sql`g.end_date`)}
    GROUP BY ${goal.kind === "new-areas" ? sql`c.area_id` : sql`c.id`} ORDER BY min(j.entry_date),name`);
}

/** Owner-only suggestions; never infer a target from another user's history. */
export async function getNextGoalGrades(db: Database, ownerId: string, viewerId: string) {
  const rows = await db.all<{ discipline: "boulder" | "sport" | "trad"; grade: number }>(
    sql`SELECT c.type AS discipline,max(c.grade) AS grade FROM sends s JOIN climbs c ON c.id=s.climb_id WHERE s.user_id=${ownerId} AND ${ownerId}=${viewerId} GROUP BY c.type`,
  );
  return Object.fromEntries(rows.map((row) => [row.discipline, row.grade + 1])) as Partial<
    Record<"boulder" | "sport" | "trad", number>
  >;
}

/** Called by logging, imports and goal mutations before returning success. */
export async function refreshGoalAchievements(db: Database, ownerId: string, now = new Date()) {
  await persistGoalCompletions(db, ownerId, now);
}

/** A derived feed refresh must not turn an already committed log into a failed save.
 * SQL invalidation hides stale events until the next write or owner read repairs them. */
export async function refreshGoalsAfterWrite(db: Database, ownerId: string) {
  try {
    await refreshGoalAchievements(db, ownerId);
  } catch (error) {
    console.error("Saved successfully, but refreshing goal achievements failed", error);
  }
}

/** SQL counterpart of goalTitle, evaluated against the live period definition. */
export function goalCompletionTitleSql() {
  const grade = sql`json_extract(CASE current.discipline WHEN 'boulder' THEN ${JSON.stringify(nativeGradeArray("boulder"))} ELSE ${JSON.stringify(nativeGradeArray("sport"))} END, '$[' || current.grade || ']')`;
  const suffix = sql`CASE current.repeat WHEN 'none' THEN '' ELSE ' every ' || current.repeat END`;
  return sql`(CASE current.kind
    WHEN 'grade' THEN 'Send my first ' || ${grade}
    WHEN 'volume' THEN 'Send ' || current.target || CASE current.target WHEN 1 THEN ' climb' ELSE ' climbs' END || CASE WHEN ${grade} IS NULL THEN '' ELSE ' at ' || ${grade} || CASE current.gradeMatch WHEN 'at-least' THEN ' or harder' ELSE '' END END || ${suffix}
    WHEN 'days' THEN 'Climb on ' || current.target || CASE current.target WHEN 1 THEN ' day' ELSE ' days' END || ${suffix}
    WHEN 'new-areas' THEN 'Visit ' || current.target || CASE current.target WHEN 1 THEN ' new area' ELSE ' new areas' END || ${suffix}
    ELSE 'Train ' || current.target || CASE current.target WHEN 1 THEN ' time' ELSE ' times' END || ${suffix} END) || CASE WHEN json_array_length(current.tags)>0 THEN ' · ' || (SELECT group_concat('#' || value, ' ') FROM json_each(current.tags)) ELSE '' END`;
}

/** Recompute inside the D1 batch, so an earlier read cannot overwrite newer logs or goals. */
async function persistGoalCompletions(
  db: Database,
  ownerId: string,
  now: Date,
  known: {
    source?: NonNullable<Awaited<ReturnType<typeof goalPeriodsQuery>>>;
    ids?: number[];
  } = {},
) {
  const source = known.source ?? (await goalPeriodsQuery(db, ownerId, ownerId, now));
  if (!source) return;
  const staleIds =
    known.ids ??
    (
      await db.all<{ id: number }>(
        sql`SELECT DISTINCT id FROM (${source.cachedQuery}) WHERE cacheFresh=0`,
      )
    ).map((row) => row.id);
  if (!staleIds.length) return;
  const completed = sql`SELECT * FROM (${source.cachedQuery}) current WHERE current.completedDate IS NOT NULL AND current.completedDate <= json_extract(${source.dates}, '$."' || current.timezone || '"')`;
  const goalIds = sql`SELECT id FROM goals WHERE user_id=${ownerId} AND id IN (SELECT value FROM json_each(${JSON.stringify(staleIds)}))
      AND json_extract(${source.dates}, '$."' || timezone || '"') IS NOT NULL
      AND COALESCE(json_extract(progress_dates, '$."' || timezone || '"'),'') <= json_extract(${source.dates}, '$."' || timezone || '"')
      AND NOT EXISTS (SELECT 1 FROM goal_periods h WHERE h.goal_id=goals.id AND (
        json_extract(${source.dates}, '$."' || h.timezone || '"') IS NULL OR
        COALESCE(json_extract(progress_dates, '$."' || h.timezone || '"'),'') > json_extract(${source.dates}, '$."' || h.timezone || '"')))`;
  await db.batch([
    db.delete(goalProgress).where(sql`goal_id IN (${goalIds}) AND NOT EXISTS (
      SELECT 1 FROM (${source.cachedQuery}) current WHERE current.id=goal_progress.goal_id
        AND current.periodStart=goal_progress.period_start AND current.repeat=goal_progress.repeat)`),
    // Aggregate journals once, reusing clean periods, then derive events from these rows.
    db
      .insert(goalProgress)
      .select(sql`SELECT current.id,current.periodStart,current.repeat,current.periodEnd,current.progress,current.completedDate
      FROM (${source.query}) current WHERE current.id IN (${goalIds})`)
      .onConflictDoUpdate({
        target: [goalProgress.goalId, goalProgress.periodStart, goalProgress.repeat],
        set: {
          periodEnd: sql`excluded.period_end`,
          progress: sql`excluded.progress`,
          completedDate: sql`excluded.completed_date`,
        },
        setWhere: sql`goal_progress.period_end IS NOT excluded.period_end OR goal_progress.progress IS NOT excluded.progress OR goal_progress.completed_date IS NOT excluded.completed_date`,
      }),
    db.delete(goalCompletions).where(sql`goal_id IN (${goalIds})
      AND NOT EXISTS (SELECT 1 FROM (${completed}) current WHERE current.id=goal_completions.goal_id
        AND current.periodStart=goal_completions.period_start AND current.repeat=goal_completions.repeat)`),
    db
      .insert(goalCompletions)
      .select(
        sql`SELECT NULL,current.id,current.periodStart,current.repeat,current.completedDate,${goalCompletionTitleSql()} FROM (${completed}) current WHERE current.id IN (${goalIds})`,
      )
      .onConflictDoUpdate({
        target: [goalCompletions.goalId, goalCompletions.periodStart, goalCompletions.repeat],
        set: { completedDate: sql`excluded.completed_date`, title: sql`excluded.title` },
        setWhere: sql`goal_completions.completed_date IS NOT excluded.completed_date OR goal_completions.title IS NOT excluded.title`,
      }),
    ...goalAchievementStatements(db, goalIds, now),
    db
      .update(goals)
      .set({
        progressDirty: false,
        progressDates: sql`${source.dates}`,
        progressRefreshDate: sql`(SELECT min(j.entry_date) FROM journal_entries j
          WHERE j.user_id=goals.user_id AND j.entry_date>json_extract(${source.dates}, '$."' || goals.timezone || '"')
            AND j.entry_date>=goals.start_date
            AND ((goals.repeat='none' AND j.entry_date<=goals.end_date)
              OR (goals.repeat<>'none' AND (goals.recurring_end_date IS NULL OR j.entry_date<=goals.recurring_end_date))))`,
      })
      .where(
        sql`id IN (${goalIds}) AND (progress_dirty=1 OR progress_dates IS NOT ${source.dates})`,
      ),
  ]);
}
