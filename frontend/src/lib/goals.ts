import { ActionError } from "@/lib/action-result";
import {
  DEFAULT_GRADE_PREFERENCES,
  formatGrade,
  type ClimbType,
  type GradePreferences,
} from "@/lib/grades";
import { isRealIsoDate } from "@/lib/sends";
import type { ActionArgs } from "@/spa/lib/action-contracts";

export type GoalInput = ActionArgs<"saveGoal">[1];

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
    if (!isRealIsoDate(startDate) || !isRealIsoDate(endDate))
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
  prefs: GradePreferences,
) {
  const grade =
    goal.discipline && goal.grade !== null ? formatGrade(goal.discipline, goal.grade, prefs) : null;
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

/** The goal as a sentence, with its grade in the reader's chosen scale. The
 * stored ordinal is what the goal counts against (docs/goals.md), so a
 * French "3 or harder" goal saved from the picker holds 5.4 and reads "3". */
export function goalTitle(
  goal: GoalTitleInput,
  prefs: GradePreferences = DEFAULT_GRADE_PREFERENCES,
) {
  return (
    baseGoalTitle(goal, prefs) +
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
