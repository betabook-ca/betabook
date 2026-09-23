import { z } from "zod";

import { ActionError } from "@/lib/action-result";
import { nativeGradeArray, type ClimbType } from "@/lib/grades";
import { normalizeTags } from "@/lib/journal";
import { isRealIsoDate } from "@/lib/sends";

export const END_DATE_ORDER_MESSAGE = "End date must be on or after start date.";
export const END_DATE_PAST_MESSAGE = "End date must be today or later.";
export const END_DATE_MISSING_MESSAGE = "Choose an end date.";
/** Messages the goal form shows on its end-date field, whichever side raised them. */
export const END_DATE_MESSAGES: ReadonlySet<string> = new Set([
  END_DATE_ORDER_MESSAGE,
  END_DATE_PAST_MESSAGE,
  END_DATE_MISSING_MESSAGE,
]);

export const MAX_ACTIVE_GOALS = 5;
const isoDate = z.string().refine(isRealIsoDate, "Choose a valid date.");
function validGradeMatch(value: { gradeMatch: string; kind: string; grade: number | null }) {
  return value.gradeMatch === "exact" || (value.kind === "volume" && value.grade !== null);
}
function validateRecurrence(
  value: { kind: string; repeat: string; timeframe: string },
  ctx: z.RefinementCtx,
) {
  if (value.repeat !== "none" && value.kind === "grade")
    ctx.addIssue({ code: "custom", message: "A first-grade goal cannot recur." });
  if (value.kind === "training" && (value.repeat === "year" || value.timeframe === "year"))
    ctx.addIssue({
      code: "custom",
      message: "Choose a week, month, or custom dates for training.",
    });
}
export const goalInputSchema = z
  .object({
    kind: z.enum(["volume", "grade", "training", "days", "new-areas"]),
    target: z.number().int().min(1).max(1000),
    tags: z
      .unknown()
      .transform((value, ctx) => {
        try {
          return normalizeTags(value).sort();
        } catch (error) {
          ctx.addIssue({
            code: "custom",
            message: error instanceof Error ? error.message : "Invalid tags",
          });
          return z.NEVER;
        }
      })
      .optional(),
    discipline: z.enum(["boulder", "sport", "trad"]).nullable(),
    grade: z.number().int().min(0).nullable(),
    gradeMatch: z.enum(["exact", "at-least"]).default("exact"),
    timeframe: z.enum(["week", "month", "year", "custom"]),
    startDate: isoDate.optional(),
    endDate: isoDate,
    recurringEndDate: isoDate.nullable().optional(),
    repeat: z.enum(["none", "week", "month", "year"]),
    timezone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
          return true;
        } catch {
          return false;
        }
      }),
  })
  .superRefine((value, ctx) => {
    if (
      value.timeframe === "custom" &&
      value.repeat === "none" &&
      value.startDate &&
      value.endDate < value.startDate
    )
      ctx.addIssue({
        code: "custom",
        message: END_DATE_ORDER_MESSAGE,
        path: ["endDate"],
      });
    if (value.repeat === "none" && value.recurringEndDate != null)
      ctx.addIssue({
        code: "custom",
        message: "Only recurring goals have a recurrence end date.",
        path: ["recurringEndDate"],
      });
    if (!validGradeMatch(value))
      ctx.addIssue({ code: "custom", message: "Choose a grade for an or-harder volume goal." });
    const climbing = value.kind === "volume" || value.kind === "grade";
    if (
      climbing &&
      (!value.discipline ||
        (value.grade !== null && value.grade >= nativeGradeArray(value.discipline).length))
    )
      ctx.addIssue({ code: "custom", message: "Choose a valid discipline and grade." });
    if (value.kind === "grade" && (value.grade === null || value.target !== 1))
      ctx.addIssue({
        code: "custom",
        message: "A new-grade goal needs one climb at a specific grade.",
      });
    if (!climbing && (value.discipline !== null || value.grade !== null))
      ctx.addIssue({ code: "custom", message: "Only climbing goals can specify a grade." });
    validateRecurrence(value, ctx);
  });
export type GoalInput = z.infer<typeof goalInputSchema>;
type GoalKind = GoalInput["kind"];
export type GoalDefinition = {
  id: number;
  archived?: boolean;
  recurringEndDate?: string | null;
  tags?: string[];
  userId: string;
  kind: GoalKind;
  target: number;
  discipline: ClimbType | null;
  grade: number | null;
  gradeMatch?: "exact" | "at-least";
  timeframe: GoalInput["timeframe"];
  repeat: GoalInput["repeat"];
  startDate: string;
  endDate: string;
  timezone: string;
};
export type GoalProgress = GoalDefinition & {
  /** Current civil date in the live goal’s saved timezone, supplied by the server. */
  today?: string;
  missed?: boolean;
  needsAction?: boolean;
  periodStart: string;
  periodEnd: string;
  progress: number;
  completedDate: string | null;
  recurring?: {
    met: number;
    total: number;
    recent: GoalPeriod[];
    hasMore: boolean;
    nextOffset?: number;
    anchorMonth?: string;
  };
};
export type GoalPeriod = Pick<
  GoalProgress,
  "periodStart" | "periodEnd" | "target" | "progress" | "repeat" | "completedDate"
>;
export type GoalYearSummary = {
  year: number;
  achieved: number;
};
export type GoalPage = {
  goals: GoalProgress[];
  hasMore: boolean;
  total?: number;
  summary?: GoalYearSummary;
  celebrations?: GoalProgress[];
  years?: number[];
};
export type GoalContribution = { id: number; name: string; type: "climb" | "area" };

// Cache formatter configuration, never a date result; civil midnight must remain live.
const goalDateFormatters = new Map<string, Intl.DateTimeFormat>();
export function goalToday(timezone: string, now = new Date()) {
  let formatter = goalDateFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    if (goalDateFormatters.size >= 32) {
      const oldest = goalDateFormatters.keys().next().value;
      if (oldest !== undefined) goalDateFormatters.delete(oldest);
    }
    goalDateFormatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-");
}
export function goalWindow(
  timeframe: GoalInput["timeframe"],
  today: string,
  endDate: string,
  startDate = today,
) {
  const date = new Date(`${today}T12:00:00Z`);
  if (timeframe === "custom") {
    if (!isoDate.safeParse(startDate).success || !isoDate.safeParse(endDate).success)
      throw new ActionError("Choose valid start and end dates.");
    if (endDate < startDate) throw new ActionError(END_DATE_ORDER_MESSAGE);
    return { startDate, endDate };
  }
  if (timeframe === "week") {
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const startDate = date.toISOString().slice(0, 10);
    date.setUTCDate(date.getUTCDate() + 6);
    return { startDate, endDate: date.toISOString().slice(0, 10) };
  }
  if (timeframe === "year")
    return { startDate: `${today.slice(0, 4)}-01-01`, endDate: `${today.slice(0, 4)}-12-31` };
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return { startDate: `${today.slice(0, 7)}-01`, endDate: date.toISOString().slice(0, 10) };
}
function baseGoalTitle(
  goal: Pick<GoalDefinition, "kind" | "target" | "discipline" | "grade" | "repeat" | "gradeMatch">,
) {
  const grade =
    goal.discipline && goal.grade !== null ? nativeGradeArray(goal.discipline)[goal.grade] : null;
  const suffix = goal.repeat === "none" ? "" : ` every ${goal.repeat}`;
  if (goal.kind === "grade") return `Send my first ${grade}`;
  if (goal.kind === "volume")
    return `Send ${goal.target} ${goal.target === 1 ? "climb" : "climbs"}${grade ? ` at ${grade}${goal.gradeMatch === "at-least" ? " or harder" : ""}` : ""}${suffix}`;
  if (goal.kind === "days")
    return `Climb on ${goal.target} ${goal.target === 1 ? "day" : "days"}${suffix}`;
  if (goal.kind === "new-areas")
    return `Visit ${goal.target} new ${goal.target === 1 ? "area" : "areas"}${suffix}`;
  return `Train ${goal.target} ${goal.target === 1 ? "time" : "times"}${suffix}`;
}

export type GoalTitleInput = Pick<
  GoalDefinition,
  "kind" | "target" | "discipline" | "grade" | "repeat" | "gradeMatch" | "tags"
>;

export function goalTitle(goal: GoalTitleInput) {
  return (
    baseGoalTitle(goal) +
    (goal.tags?.length ? ` · ${goal.tags.map((tag) => `#${tag}`).join(" ")}` : "")
  );
}

export type GoalHistoryPage = {
  periods: GoalPeriod[];
  hasMore: boolean;
  nextOffset: number;
  anchorMonth: string;
};

/** One calendar month from the first missed day, clamped to the destination month's last day. */
export function missedGoalArchiveDate(deadline: string) {
  const date = new Date(`${deadline}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}
export function isMissedGoal(
  goal: Pick<GoalProgress, "repeat" | "progress" | "target" | "periodEnd">,
  today: string,
) {
  return goal.repeat === "none" && goal.progress < goal.target && goal.periodEnd < today;
}
export function missedGoalNeedsAction(
  goal: Pick<GoalProgress, "repeat" | "progress" | "target" | "periodEnd" | "archived">,
  today: string,
) {
  return (
    !goal.archived && isMissedGoal(goal, today) && today < missedGoalArchiveDate(goal.periodEnd)
  );
}
