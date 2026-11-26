"use server";

import { sql, type SQL } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";

import { scheduleGoalRefresh } from "@/actions/goal-refresh";
import { getDb } from "@/db/client";
import { goalCountSql } from "@/db/queries/goals";
import { goals, goalPeriods } from "@/db/schema";
import {
  ActionError,
  JOURNAL_RATE_LIMIT_MESSAGE,
  toActionResult,
  type ActionResult,
} from "@/lib/action-result";
import {
  END_DATE_PAST_MESSAGE,
  goalInputSchema,
  missedGoalNeedsAction,
  type GoalProgress,
  goalToday,
  goalWindow,
  MAX_ACTIVE_GOALS,
  type GoalInput,
} from "@/lib/goals";
import { allowJournalWrite } from "@/lib/rate-limit";
import { ISO_DATE_RE } from "@/lib/sends";
import { requireSession } from "@/lib/session";
import { requirePositiveId } from "@/lib/validation";

import { afterCommit } from "./post-commit";
import { revalidateGoalSurfaces } from "./revalidation";

function validateGoalId(id: number | null) {
  if (id !== null) requirePositiveId(id, "Goal not found.");
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
    ? sql`(SELECT ${goalCountSql()} >= ${input.target} FROM (SELECT ${ownerId} AS user_id,${input.kind} AS kind,${input.discipline} AS discipline,${input.grade} AS grade,${input.gradeMatch} AS grade_match,${JSON.stringify(input.tags ?? [])} AS tags,${window.startDate} AS start_date,${window.endDate} AS end_date) g)`
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

function recurringEndSetting(existing: ExistingGoal | null | undefined, input: GoalInput) {
  const value =
    input.repeat === "none"
      ? null
      : input.recurringEndDate === undefined
        ? (existing?.recurringEndDate ?? null)
        : input.recurringEndDate;
  if (value && value < goalToday(input.timezone)) throw new ActionError(END_DATE_PAST_MESSAGE);
  return {
    value,
    update:
      input.repeat === "none"
        ? null
        : input.recurringEndDate === undefined
          ? sql`recurring_end_date`
          : input.recurringEndDate,
  };
}

export async function saveGoal(
  id: number | null,
  raw: unknown,
  retryOf?: number,
): Promise<ActionResult<number>> {
  return toActionResult(async () => {
    const session = await requireSession();
    if (!(await allowJournalWrite(session.user.id)))
      throw new ActionError(JOURNAL_RATE_LIMIT_MESSAGE);
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
    const [retrySource, existing, zones] = await Promise.all([
      retryOf === undefined ? null : actionableMissedGoal(db, retryOf, ownerId),
      id === null
        ? null
        : db.get<ExistingGoal>(
            sql`SELECT g.kind,g.discipline,g.grade,g.start_date AS startDate,g.end_date AS endDate,g.timeframe,g.repeat,g.timezone,g.archive_token AS archiveToken,g.recurring_end_date AS recurringEndDate,g.target,${goalCountSql()} AS progress FROM goals g WHERE g.id = ${id} AND g.user_id = ${ownerId}`,
          ),
      db.all<{ timezone: string }>(
        sql`SELECT DISTINCT timezone FROM goals WHERE user_id=${ownerId}`,
      ),
    ]);
    if (id !== null && !existing) throw new ActionError("Goal not found.");
    const window = goalSaveWindow(existing, input);
    const recurringEnd = recurringEndSetting(existing, input);
    if (needsMilestoneEligibilityCheck(existing, input, window.startDate)) {
      const prior = await db.get(
        sql`SELECT 1 FROM sends s JOIN climbs c ON c.id = s.climb_id WHERE s.user_id = ${ownerId} AND c.type = ${input.discipline} AND c.grade >= ${input.grade} AND (s.date_sent IS NULL OR s.date_sent < ${window.startDate}) LIMIT 1`,
      );
      if (prior)
        throw new ActionError(
          "You’ve already sent this grade. Choose a new grade or a volume goal.",
        );
    }
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
    const insertGoal = (condition: SQL) =>
      db
        .insert(goals)
        .select(
          db
            .select({
              id: sql`NULL`.as("id"),
              userId: sql`${ownerId}`.as("user_id"),
              kind: sql`${input.kind}`.as("kind"),
              target: sql`${input.target}`.as("target"),
              discipline: sql`${input.discipline}`.as("discipline"),
              grade: sql`${input.grade}`.as("grade"),
              timeframe: sql`${input.timeframe}`.as("timeframe"),
              repeat: sql`${input.repeat}`.as("repeat"),
              startDate: sql`${window.startDate}`.as("start_date"),
              endDate: sql`${window.endDate}`.as("end_date"),
              timezone: sql`${input.timezone}`.as("timezone"),
              celebrationsInitialized: sql`1`.as("celebrations_initialized"),
              archiveToken: sql`NULL`.as("archive_token"),
              gradeMatch: sql`${input.gradeMatch}`.as("grade_match"),
              tags: sql`${JSON.stringify(input.tags)}`.as("tags"),
              recurringEndDate: sql`${recurringEnd.value}`.as("recurring_end_date"),
            })
            .from(sql`(SELECT 1)`)
            .where(condition),
        )
        .returning({ id: goals.id });

    let result: { id: number } | undefined;
    if (retrySource) {
      const archiveToken = crypto.randomUUID();
      const [, inserted] = await db.batch([
        db
          .update(goals)
          .set({ archiveToken })
          .where(
            sql`id IN (SELECT g.id FROM goals g WHERE ${missedDecisionSql(retrySource, ownerId)} AND ${capacity})`,
          ),
        insertGoal(sql`EXISTS (
          SELECT 1 FROM goals
          WHERE id = ${retrySource.id} AND user_id = ${ownerId} AND archive_token = ${archiveToken}
        )`),
      ]);
      [result] = inserted;
    } else if (id === null) {
      [result] = await insertGoal(capacity);
    } else {
      const cutoff = historyCutoff(existing, window.startDate);
      const snapshot = sql`
        WITH RECURSIVE past AS (
          SELECT id, start_date AS ps, end_date AS pe, target, repeat,
            timezone, kind, discipline, grade, grade_match, tags, recurring_end_date
          FROM goals
          WHERE id = ${id} AND user_id = ${ownerId} AND repeat <> 'none'
          UNION ALL
          SELECT id, date(pe, '+1 day'),
            CASE repeat
              WHEN 'week' THEN date(pe, '+7 days')
              WHEN 'year' THEN date(pe, '+1 day', '+1 year', '-1 day')
              ELSE date(pe, '+1 day', '+1 month', '-1 day')
            END,
            target, repeat, timezone, kind, discipline, grade, grade_match, tags, recurring_end_date
          FROM past WHERE pe < ${cutoff} AND pe < COALESCE(recurring_end_date,'9999-12-31')
        )
        SELECT id, ps, min(pe,COALESCE(recurring_end_date,pe)), target, repeat, timezone, kind, discipline, grade, grade_match, tags
        FROM past WHERE pe < ${cutoff} AND ${capacity}
      `;
      const update = db
        .update(goals)
        .set({
          kind: input.kind,
          target: input.target,
          discipline: input.discipline,
          grade: input.grade,
          gradeMatch: input.gradeMatch,
          tags: input.tags,
          recurringEndDate: recurringEnd.update,
          timeframe: input.timeframe,
          repeat: input.repeat,
          startDate: window.startDate,
          endDate: window.endDate,
          timezone: input.timezone,
        })
        .where(
          sql`id=${id} AND user_id=${ownerId} AND archive_token IS NULL AND (recurring_end_date IS NULL OR recurring_end_date >= COALESCE(json_extract(${civilDates}, '$."' || timezone || '"'), '9999-12-31')) AND ${capacity}`,
        )
        .returning({ id: goals.id });
      const [, updated] = await db.batch([
        db.insert(goalPeriods).select(snapshot).onConflictDoNothing(),
        update,
      ]);
      [result] = updated;
    }
    if (!result && retrySource) await actionableMissedGoal(db, retrySource.id, ownerId);
    if (!result)
      throw new ActionError(
        `You can have up to ${MAX_ACTIVE_GOALS} active goals. Delete a goal to make room.`,
      );
    await scheduleGoalRefresh(db, ownerId);
    afterCommit(() => {
      revalidateGoalSurfaces(ownerId);
      refresh();
    });
    return result.id;
  });
}

export async function deleteGoal(id: number): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();
    validateGoalId(id);
    const db = await getDb();
    const result = await db.get(
      sql`DELETE FROM goals WHERE id = ${id} AND user_id = ${session.user.id} RETURNING id`,
    );
    if (!result) throw new ActionError("Goal not found.");
    await scheduleGoalRefresh(db, session.user.id);
    afterCommit(() => {
      revalidateGoalSurfaces(session.user.id);
      refresh();
    });
  });
}

const acknowledgementSchema = z
  .array(
    z.object({
      id: z.number().int().positive(),
      periodStart: z.string().regex(ISO_DATE_RE),
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
      throw new ActionError(JOURNAL_RATE_LIMIT_MESSAGE);
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
    await scheduleGoalRefresh(db, session.user.id);
    afterCommit(() => {
      revalidateGoalSurfaces(session.user.id);
      refresh();
    });
  });
}
