import {
  missedGoalNeedsAction,
  isMissedGoal,
  goalToday,
  type GoalPage,
  type GoalProgress,
  type GoalYearSummary,
} from "./goals";

/** Successful periods appear immediately; only ended periods can be missed. */
function isRecordedGoalPeriod(goal: GoalProgress, now: Date): boolean {
  const today = goalToday(goal.timezone, now);
  return (
    goal.repeat !== "none" &&
    (goal.periodEnd < today ||
      (goal.periodStart <= today &&
        goal.progress >= goal.target &&
        goal.completedDate !== null &&
        goal.completedDate <= today))
  );
}

function newestAchievement(a: GoalProgress, b: GoalProgress) {
  return (
    (b.completedDate ?? b.periodEnd).localeCompare(a.completedDate ?? a.periodEnd) || b.id - a.id
  );
}

export function summarizeGoalPeriods(
  periods: GoalProgress[],
  view: "active" | "completed",
  offset: number,
  now: Date,
  selectedYear?: number,
): GoalPage {
  const currentYear = Number(goalToday(periods[0]?.timezone ?? "UTC", now).slice(0, 4));
  const recorded = periods.filter((g) => isRecordedGoalPeriod(g, now));
  const finished = periods.filter(
    (g) =>
      g.repeat === "none" &&
      (g.completedDate ||
        g.archived ||
        (g.periodEnd < goalToday(g.timezone, now) &&
          !missedGoalNeedsAction(g, goalToday(g.timezone, now)))),
  );
  const years = [
    ...new Set([
      ...recorded.map((g) => Number(g.periodStart.slice(0, 4))),
      ...finished.map((g) => Number((g.completedDate ?? g.periodEnd).slice(0, 4))),
    ]),
  ].sort((a, b) => b - a);
  if (years.length === 0) years.push(currentYear);
  const year = selectedYear ?? (years.includes(currentYear) ? currentYear : years[0]);
  const inYear = recorded.filter((g) => Number(g.periodStart.slice(0, 4)) === year);
  const achieved = finished.filter(
    (g) => Number((g.completedDate ?? g.periodEnd).slice(0, 4)) === year,
  );
  const summary: GoalYearSummary = {
    year,
    achieved: new Set([
      ...achieved.filter((g) => g.completedDate).map((g) => g.id),
      ...inYear.filter((g) => g.progress >= g.target).map((g) => g.id),
    ]).size,
  };
  function withHistory(goal: GoalProgress): GoalProgress {
    const history = recorded
      .filter((g) => g.id === goal.id)
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
    if (history.length === 0) return goal;
    const routinePeriods = periods.filter((p) => p.id === goal.id && p.repeat !== "none");
    const currentPeriod = routinePeriods.find(
      (p) =>
        p.repeat !== "none" &&
        p.periodStart <= goalToday(p.timezone, now) &&
        p.periodEnd >= goalToday(p.timezone, now),
    );
    const page = pageGoalHistory(
      routinePeriods,
      currentPeriod?.repeat ?? history[0].repeat,
      0,
      now,
    );
    return {
      ...goal,
      recurring: {
        met: history.filter((g) => g.progress >= g.target).length,
        total: history.length,
        recent: page.periods,
        hasMore: page.hasMore,
        nextOffset: page.nextOffset,
        anchorMonth: page.anchorMonth,
      },
    };
  }
  function withStatus(goal: GoalProgress): GoalProgress {
    const today = goalToday(goal.timezone, now);
    return {
      ...goal,
      missed: isMissedGoal(goal, today),
      needsAction: missedGoalNeedsAction(goal, today),
    };
  }
  if (view === "active") {
    const goals = periods
      .filter((g) =>
        g.repeat === "none"
          ? !g.archived &&
            g.progress < g.target &&
            (g.periodEnd >= goalToday(g.timezone, now) ||
              missedGoalNeedsAction(g, goalToday(g.timezone, now)))
          : g.periodStart <= goalToday(g.timezone, now) &&
            g.periodEnd >= goalToday(g.timezone, now),
      )
      .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || a.id - b.id)
      .map(withStatus);
    return { goals, total: goals.length, hasMore: false };
  }
  const groups = new Map<number, GoalProgress>(achieved.map((goal) => [goal.id, goal]));
  for (const goal of inYear.sort(newestAchievement)) {
    if (!groups.has(goal.id)) groups.set(goal.id, goal);
  }
  const goals = [...groups.values()].sort(newestAchievement);
  return {
    goals: goals
      .slice(offset, offset + 5)
      .map(withHistory)
      .map(withStatus),
    total: goals.length,
    hasMore: goals.length > offset + 5,
    summary,
    years,
  };
}

function monthIndex(date: string) {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}
function monthStart(index: number) {
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}
/** Stable whole-month bounds shared by the database query and local stories. */
export function goalHistoryWindow(
  periods: GoalProgress[],
  repeat: string,
  offset = 0,
  now = new Date(),
  anchorMonth?: string,
) {
  const sorted = periods
    .filter((goal) => goal.repeat !== "none" && goal.periodStart <= goalToday(goal.timezone, now))
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  if (sorted.length === 0) {
    const anchor = anchorMonth ?? goalToday("UTC", now).slice(0, 7);
    return {
      from: `${anchor}-01`,
      until: `${anchor}-01`,
      hasMore: false,
      nextOffset: offset,
      anchorMonth: anchor,
    };
  }
  const today = goalToday(sorted[0].timezone, now);
  const latest = sorted.some((goal) => goal.periodStart <= today && goal.periodEnd >= today)
    ? monthIndex(today)
    : monthIndex(sorted[0].periodStart);
  const latestAnchor = repeat === "year" ? Math.floor(latest / 12) * 12 + 11 : latest;
  const anchor = anchorMonth
    ? Math.min(monthIndex(`${anchorMonth}-01`), latestAnchor)
    : latestAnchor;
  let earliest = anchor;
  for (const goal of sorted) earliest = Math.min(earliest, monthIndex(goal.periodStart));
  const count = Math.min(
    repeat === "week" ? 3 : repeat === "year" ? 60 : 12,
    Math.max(0, anchor - earliest + 1 - offset),
  );
  return {
    from: monthStart(anchor - offset - count + 1),
    until: monthStart(anchor - offset + 1),
    hasMore: offset + count < anchor - earliest + 1,
    nextOffset: offset + count,
    anchorMonth: monthStart(anchor).slice(0, 7),
  };
}
export function pageGoalHistory(
  periods: GoalProgress[],
  repeat: string,
  offset = 0,
  now = new Date(),
  anchorMonth?: string,
) {
  const { from, until, ...page } = goalHistoryWindow(periods, repeat, offset, now, anchorMonth);
  return {
    ...page,
    periods: periods
      .filter(
        (goal) =>
          goal.repeat !== "none" &&
          goal.periodStart >= from &&
          goal.periodStart < until &&
          goal.periodStart <= goalToday(goal.timezone, now),
      )
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart)),
  };
}
