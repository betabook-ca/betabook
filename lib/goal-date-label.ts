function formatGoalDate(iso: string, today: string, forceYear = false, monthOnly = false) {
  return new Intl.DateTimeFormat("en-US", {
    month: monthOnly ? "long" : "short",
    day: monthOnly ? undefined : "numeric",
    year: forceYear || iso.slice(0, 4) !== today.slice(0, 4) ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

export function goalDateLabel(
  goal: {
    repeat: string;
    timeframe: string;
    periodStart: string;
    periodEnd: string;
    completedDate?: string | null;
  },
  today: string,
): string {
  if (goal.repeat === "year") return goal.periodStart.slice(0, 4);
  if (goal.repeat === "week") return `Week of ${formatGoalDate(goal.periodStart, today)}`;
  if (goal.repeat === "month") return formatGoalDate(goal.periodStart, today, false, true);
  if (goal.timeframe === "custom") {
    const spansYears = goal.periodStart.slice(0, 4) !== goal.periodEnd.slice(0, 4);
    return `${formatGoalDate(goal.periodStart, today, spansYears)} – ${formatGoalDate(goal.periodEnd, today, spansYears)}`;
  }
  return goal.completedDate
    ? formatGoalDate(goal.completedDate, today)
    : `By ${formatGoalDate(goal.periodEnd, today)}`;
}

export function recurringGoalResetLabel(
  goal: { repeat: string; timeframe: string; periodStart: string; periodEnd: string },
  today: string,
): string {
  const next = new Date(`${goal.periodEnd}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return `Resets ${formatGoalDate(next.toISOString().slice(0, 10), today)}`;
}
