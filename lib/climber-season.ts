const SEASON_WEEKS = 52;

export type SeasonWeek = { start: string; days: number };

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (time: number) => new Date(time).toISOString().slice(0, 10);

function firstWeekStart(today: string, weeks: number) {
  const time = toTime(today);
  const monday = time - ((new Date(time).getUTCDay() + 6) % 7) * DAY_MS;
  return monday - (weeks - 1) * WEEK_MS;
}

/** Civil dates bounding a season, for the query that feeds `buildSeason`. */
export function seasonRange(today: string, weeks = SEASON_WEEKS) {
  return { from: toDate(firstWeekStart(today, weeks)), to: today };
}

/** Distinct active days per Monday-start week, oldest first, ending with today's week. */
export function buildSeason(
  activeDays: readonly string[],
  today: string,
  weeks = SEASON_WEEKS,
): SeasonWeek[] {
  const first = firstWeekStart(today, weeks);
  const end = toTime(today);
  const season = Array.from({ length: weeks }, (_, index) => ({
    start: toDate(first + index * WEEK_MS),
    days: 0,
  }));
  for (const day of new Set(activeDays)) {
    const time = toTime(day);
    if (Number.isNaN(time) || time < first || time > end) continue;
    season[Math.floor((time - first) / WEEK_MS)].days += 1;
  }
  return season;
}
