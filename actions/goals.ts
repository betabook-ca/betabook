"use server";

import { sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db/client";
import { goalCountSql, refreshGoalsAfterWrite } from "@/db/queries/goals";
import { goals, goalPeriods } from "@/db/schema";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import {
  goalInputSchema,
  missedGoalNeedsAction,
  type GoalProgress,
  goalToday,
  goalWindow,
  MAX_ACTIVE_GOALS,
  type GoalInput,
} from "@/lib/goals";
import { allowJournalWrite } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";

import { revalidateJournalSurfaces } from "./revalidation";

function validateGoalId(id: number | null) {
  if (id !== null && (!Number.isSafeInteger(id) || id < 1))
    throw new ActionError("Goal not found.");
}

function historyCutoff(
  existing: { repeat: GoalInput["repeat"]; timezone: string; endDate: string } | null | undefined,
  fallback: string,
) {
  return existing && existing.repeat !== "none"
    ? goalWindow(existing.repeat, goalToday(existing.timezone), existing.endDate).startDate
    : fallback;
}

function inactiveInputSql(
  input: GoalInput,
  window: { startDate: string; endDate: string },
  ownerId: string,
  today: string,
) {
  if (input.repeat === "none" && window.endDate < today) return sql`1`;
  return input.repeat === "none"
    ? sql`(SELECT ${goalCountSql(false)} >= ${input.target} FROM (SELECT ${ownerId} AS user_id,${input.kind} AS kind,${input.discipline} AS discipline,${input.grade} AS grade,${input.gradeMatch} AS grade_match,${JSON.stringify(input.tags ?? [])} AS tags,${window.startDate} AS start_date,${window.endDate} AS end_date) g)`
    : sql`0`;
}

async function actionableMissedGoal(
  db: Awaited<ReturnType<typeof getDb>>,
  id: number,
  ownerId: string,
) {
  const goal = await db.get<
    Pick<
      GoalProgress,
      "id" | "repeat" | "target" | "progress" | "periodEnd" | "timezone" | "archived"
    >
  >(
    sql`SELECT g.id,g.repeat,g.target,g.timezone,g.end_date AS periodEnd,(g.archive_token IS NOT NULL) AS archived,${goalCountSql()} AS progress FROM goals g WHERE g.id=${id} AND g.user_id=${ownerId}`,
  );
  if (!goal || !missedGoalNeedsAction(goal, goalToday(goal.timezone)))
    throw new ActionError("This goal no longer needs a decision.");
  return goal;
}
function missedDecisionSql(
  goal: { id: number; periodEnd: string; timezone: string },
  ownerId: string,
) {
  return sql`g.id=${goal.id} AND g.user_id=${ownerId} AND g.archive_token IS NULL AND g.repeat='none' AND g.end_date=${goal.periodEnd} AND g.end_date<${goalToday(goal.timezone)} AND ${goalCountSql()}<g.target`;
}

type ExistingGoal = Pick<
  typeof goals.$inferSelect,
  | "startDate"
  | "endDate"
  | "timeframe"
  | "repeat"
  | "timezone"
  | "archiveToken"
  | "recurringEndDate"
  | "target"
  | "kind"
  | "discipline"
  | "grade"
> & { progress: number };
/** Ordinary edits retain the eligibility accepted for this milestone. */
function needsMilestoneEligibilityCheck(
  existing: ExistingGoal | null | undefined,
  input: GoalInput,
  startDate: string,
) {
  return (
    input.kind === "grade" &&
    (existing?.kind !== "grade" ||
      existing.discipline !== input.discipline ||
      existing.grade !== input.grade ||
      existing.startDate !== startDate)
  );
}

function goalSaveWindow(existing: ExistingGoal | null | undefined, input: GoalInput) {
  if (existing?.recurringEndDate && existing.recurringEndDate < goalToday(existing.timezone))
    throw new ActionError("This routine has ended. Set a new goal to start again.");
  if (
    existing &&
    (existing.archiveToken ||
      (existing.repeat === "none" &&
        existing.endDate < goalToday(existing.timezone) &&
        existing.progress < existing.target &&
        !missedGoalNeedsAction(
          { ...existing, periodEnd: existing.endDate },
          goalToday(existing.timezone),
        )))
  )
    throw new ActionError(
      "Use Try again to create a new attempt; the original goal stays unchanged.",
    );
  const period = input.repeat === "none" ? input.timeframe : input.repeat;
  return existing &&
    existing.repeat === "none" &&
    existing.timeframe === input.timeframe &&
    existing.repeat === input.repeat &&
    period !== "custom"
    ? { startDate: existing.startDate, endDate: existing.endDate }
    : goalWindow(
        period,
        goalToday(input.timezone),
        input.endDate,
        input.startDate ?? existing?.startDate,
      );
}

export async function saveGoal(
  id: number | null,
  raw: unknown,
  retryOf?: number,
): Promise<ActionResult<number>> {
  return toActionResult(async () => {
    const session = await requireSession();
    if (!(await allowJournalWrite(session.user.id)))
      throw new ActionError("Please wait before changing another goal.");
    validateGoalId(id);
    if (retryOf !== undefined) {
      validateGoalId(retryOf);
      if (id !== null) throw new ActionError("A retry must create a new goal.");
    }
    const parsed = goalInputSchema.safeParse(raw);
    if (!parsed.success)
      throw new ActionError(parsed.error.issues[0]?.message ?? "Check your goal fields.");
    const input = { ...parsed.data, tags: parsed.data.tags ?? [] };
    const ownerId = session.user.id;
    const db = await getDb();
    const retrySource =
      retryOf === undefined ? null : await actionableMissedGoal(db, retryOf, ownerId);
    const existing =
      id === null
        ? null
        : await db.get<ExistingGoal>(
            sql`SELECT g.kind,g.discipline,g.grade,g.start_date AS startDate,g.end_date AS endDate,g.timeframe,g.repeat,g.timezone,g.archive_token AS archiveToken,g.recurring_end_date AS recurringEndDate,g.target,${goalCountSql()} AS progress FROM goals g WHERE g.id = ${id} AND g.user_id = ${ownerId}`,
          );
    if (id !== null && !existing) throw new ActionError("Goal not found.");
    const window = goalSaveWindow(existing, input);
    if (needsMilestoneEligibilityCheck(existing, input, window.startDate)) {
      const prior = await db.get(
        sql`SELECT 1 FROM sends s JOIN climbs c ON c.id = s.climb_id WHERE s.user_id = ${ownerId} AND c.type = ${input.discipline} AND c.grade >= ${input.grade} AND (s.date_sent IS NULL OR s.date_sent < ${window.startDate}) LIMIT 1`,
      );
      if (prior)
        throw new ActionError(
          "You’ve already sent this grade. Choose a new grade or a volume goal.",
        );
    }
    const zones = await db.all<{ timezone: string }>(
      sql`SELECT DISTINCT timezone FROM goals WHERE user_id=${ownerId}`,
    );
    const now = new Date();
    const civilDates = JSON.stringify(
      Object.fromEntries(
        [...zones, { timezone: input.timezone }].map(({ timezone }) => [
          timezone,
          goalToday(timezone, now),
        ]),
      ),
    );
    // A concurrently created goal may use a new zone; count that row conservatively until the next read.
    const activeSql = sql`g.archive_token IS NULL AND ((g.repeat <> 'none' AND (g.recurring_end_date IS NULL OR g.recurring_end_date >= COALESCE(json_extract(${civilDates}, '$."' || g.timezone || '"'), '0000-01-01'))) OR (g.repeat='none' AND g.end_date >= COALESCE(json_extract(${civilDates}, '$."' || g.timezone || '"'), '0000-01-01') AND ${goalCountSql()} < g.target))`;
    const otherActive = sql`(SELECT count(*) FROM goals g WHERE g.user_id = ${ownerId} AND (${id} IS NULL OR g.id <> ${id}) AND ${activeSql})`;
    const alreadyActive = sql`EXISTS(SELECT 1 FROM goals g WHERE g.id=${id} AND g.user_id=${ownerId} AND ${activeSql})`;
    const remainsCompleted = inactiveInputSql(
      input,
      window,
      ownerId,
      goalToday(input.timezone, now),
    );
    const capacity = sql`(${otherActive} < ${MAX_ACTIVE_GOALS} OR ${alreadyActive} OR ${remainsCompleted})`;
    const update = db
      .update(goals)
      .set({
        kind: input.kind,
        target: input.target,
        discipline: input.discipline,
        grade: input.grade,
        gradeMatch: input.gradeMatch,
        tags: input.tags,
        timeframe: input.timeframe,
        repeat: input.repeat,
        startDate: window.startDate,
        endDate: window.endDate,
        timezone: input.timezone,
        recurringEndDate: input.repeat === "none" ? null : sql`recurring_end_date`,
      })
      .where(
        sql`id=${id} AND user_id=${ownerId} AND archive_token IS NULL AND (recurring_end_date IS NULL OR recurring_end_date >= COALESCE(json_extract(${civilDates}, '$."' || timezone || '"'), '9999-12-31')) AND ${capacity}`,
      )
      .returning({ id: goals.id });
    const cutoff = historyCutoff(existing, window.startDate);
    const snapshot = sql`WITH RECURSIVE past AS (
        SELECT id,user_id,start_date AS ps,end_date AS pe,target,repeat,timezone,kind,discipline,grade,grade_match,tags,recurring_end_date FROM goals WHERE id=${id} AND user_id=${ownerId} AND repeat <> 'none'
        UNION ALL SELECT id,user_id,date(pe,'+1 day'),CASE repeat WHEN 'week' THEN date(pe,'+7 days') WHEN 'year' THEN date(pe,'+1 day','+1 year','-1 day') ELSE date(pe,'+1 day','+1 month','-1 day') END,target,repeat,timezone,kind,discipline,grade,grade_match,tags,recurring_end_date FROM past WHERE pe < ${cutoff} AND pe < COALESCE(recurring_end_date,'9999-12-31')
      ) SELECT id,ps,min(pe,COALESCE(recurring_end_date,pe)),target,repeat,timezone,kind,discipline,grade,grade_match,tags FROM past WHERE pe < ${cutoff} AND ${capacity}`;
    const archiveToken = crypto.randomUUID();
    const result = retrySource
      ? (
          await db.batch([
            db
              .update(goals)
              .set({ archiveToken })
              .where(
                sql`id IN (SELECT g.id FROM goals g WHERE ${missedDecisionSql(retrySource, ownerId)} AND ${capacity})`,
              ),
            // Column order is the goals schema; NULL delegates the id to SQLite.
            db
              .insert(goals)
              .select(
                sql`SELECT NULL,${ownerId},${input.kind},${input.target},${input.discipline},${input.grade},${input.timeframe},${input.repeat},${window.startDate},${window.endDate},${input.timezone},1,NULL,${input.gradeMatch},${JSON.stringify(input.tags)},1,NULL,NULL WHERE EXISTS (SELECT 1 FROM goals WHERE id=${retrySource.id} AND user_id=${ownerId} AND archive_token=${archiveToken})`,
              )
              .returning({ id: goals.id }),
          ])
        )[1][0]
      : id === null
        ? await db.get<{
            id: number;
          }>(sql`INSERT INTO goals (user_id,kind,target,discipline,grade,timeframe,repeat,start_date,end_date,timezone,grade_match,celebrations_initialized,tags)
          SELECT ${ownerId},${input.kind},${input.target},${input.discipline},${input.grade},${input.timeframe},${input.repeat},${window.startDate},${window.endDate},${input.timezone},${input.gradeMatch},1,${JSON.stringify(input.tags)}
          WHERE ${capacity} RETURNING id`)
        : (
            await db.batch([db.insert(goalPeriods).select(snapshot).onConflictDoNothing(), update])
          )[1][0];
    if (!result && retrySource) await actionableMissedGoal(db, retrySource.id, ownerId);
    if (!result)
      throw new ActionError("You can have up to 5 active goals. Delete a goal to make room.");
    await refreshGoalsAfterWrite(db, ownerId);
    revalidateJournalSurfaces({ userId: ownerId, climbIds: [] });
    refresh();
    return result.id;
  });
}

export async function deleteGoal(id: number): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();
    if (!Number.isSafeInteger(id) || id < 1) throw new ActionError("Goal not found.");
    const db = await getDb();
    const result = await db.get(
      sql`DELETE FROM goals WHERE id = ${id} AND user_id = ${session.user.id} RETURNING id`,
    );
    if (!result) throw new ActionError("Goal not found.");
    await refreshGoalsAfterWrite(db, session.user.id);
    revalidateJournalSurfaces({ userId: session.user.id, climbIds: [] });
    refresh();
  });
}

const acknowledgementSchema = z
  .array(
    z.object({
      id: z.number().int().positive(),
      periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      repeat: z.enum(["none", "week", "month", "year"]),
    }),
  )
  .max(1000);
export async function acknowledgeGoalAchievements(raw: unknown): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();
    const parsed = acknowledgementSchema.safeParse(raw);
    if (!parsed.success) throw new ActionError("Invalid achievements.");
    const db = await getDb();
    await db.run(sql`UPDATE goal_achievements SET acknowledged_at=${new Date().toISOString()}
      WHERE (goal_id,period_start,repeat) IN (SELECT json_extract(value,'$.id'),json_extract(value,'$.periodStart'),json_extract(value,'$.repeat') FROM json_each(${JSON.stringify(parsed.data)}))
      AND goal_id IN (SELECT id FROM goals WHERE user_id=${session.user.id})`);
  });
}

export async function archiveGoal(id: number): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();
    if (!(await allowJournalWrite(session.user.id)))
      throw new ActionError("Please wait before changing another goal.");
    validateGoalId(id);
    const db = await getDb();
    const finished = sql`g.id=${id} AND g.user_id=${session.user.id} AND g.archive_token IS NULL AND g.repeat='none' AND ${goalCountSql()}>=g.target`;
    const completed = await db.get(sql`SELECT g.id FROM goals g WHERE ${finished}`);
    const goal = completed ? null : await actionableMissedGoal(db, id, session.user.id);
    const updated = await db
      .update(goals)
      .set({ archiveToken: crypto.randomUUID() })
      .where(
        sql`id IN (SELECT g.id FROM goals g WHERE ${goal ? missedDecisionSql(goal, session.user.id) : finished})`,
      )
      .returning({ id: goals.id });
    if (!updated.length) throw new ActionError("This goal no longer needs a decision.");
    await refreshGoalsAfterWrite(db, session.user.id);
    revalidateJournalSurfaces({ userId: session.user.id, climbIds: [] });
    refresh();
  });
}

/** Schedule the last inclusive day without changing cadence or historical event identities. */
export async function endRecurringGoal(id: number, endDate: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();
    if (!(await allowJournalWrite(session.user.id)))
      throw new ActionError("Please wait before changing another goal.");
    validateGoalId(id);
    const date = new Date(`${endDate}T12:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
      Number.isNaN(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== endDate
    )
      throw new ActionError("Choose a valid end date.");
    const db = await getDb();
    const goal = await db.get<{ timezone: string }>(
      sql`SELECT timezone FROM goals WHERE id=${id} AND user_id=${session.user.id} AND repeat<>'none' AND archive_token IS NULL`,
    );
    if (!goal) throw new ActionError("Recurring goal not found.");
    const today = goalToday(goal.timezone);
    if (endDate < today) throw new ActionError("End date must be today or later.");
    const updated = await db
      .update(goals)
      .set({ recurringEndDate: endDate })
      .where(
        sql`id=${id} AND user_id=${session.user.id} AND repeat<>'none' AND archive_token IS NULL AND timezone=${goal.timezone} AND start_date<=${endDate} AND (recurring_end_date IS NULL OR recurring_end_date>=${today})`,
      )
      .returning({ id: goals.id });
    if (!updated.length)
      throw new ActionError("This routine has ended or changed. Reload your goals.");
    await refreshGoalsAfterWrite(db, session.user.id);
    revalidateJournalSurfaces({ userId: session.user.id, climbIds: [] });
    refresh();
  });
}
