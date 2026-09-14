/** Civil goal dates never shift with the viewer's timezone. */
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
  const currentYear = today.slice(0, 4);
  const date = (iso: string, forceYear = false, monthOnly = false) =>
    new Intl.DateTimeFormat("en-US", {
      month: monthOnly ? "long" : "short",
      day: monthOnly ? undefined : "numeric",
      year: forceYear || iso.slice(0, 4) !== currentYear ? "numeric" : undefined,
      timeZone: "UTC",
    }).format(new Date(`${iso}T12:00:00Z`));
  if (goal.repeat === "year") return goal.periodStart.slice(0, 4);
  if (goal.repeat === "week") return `Week of ${date(goal.periodStart)}`;
  if (goal.repeat === "month") return date(goal.periodStart, false, true);
  if (goal.timeframe === "custom") {
    const spansYears = goal.periodStart.slice(0, 4) !== goal.periodEnd.slice(0, 4);
    return `${date(goal.periodStart, spansYears)} – ${date(goal.periodEnd, spansYears)}`;
  }
  return goal.completedDate ? date(goal.completedDate) : `By ${date(goal.periodEnd)}`;
}

export function recurringGoalResetLabel(
  goal: { repeat: string; timeframe: string; periodStart: string; periodEnd: string },
  today: string,
): string {
  const next = new Date(`${goal.periodEnd}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const reset = goalDateLabel(
    {
      ...goal,
      repeat: "none",
      timeframe: "month",
      completedDate: null,
      periodEnd: next.toISOString().slice(0, 10),
    },
    today,
  ).replace(/^By /, "");
  return `Resets ${reset}`;
}
