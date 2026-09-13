import { formatCount } from "@/lib/format";

/** Sends store civil dates as plain "YYYY-MM-DD" strings (see
 * drizzle/schema/sends.ts) — no time, no zone. Formatting goes through UTC
 * on both ends (ISO date-only strings parse as UTC midnight) so the
 * displayed date never shifts a day with the viewer's timezone. */
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-08-28" → "Aug 28, 2026". Missing dates render as "—" — the
 * app-wide fallback for absent row values (grades, ratings, dates). An
 * unparseable string is shown as-is rather than dropped. */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return DATE_FORMAT.format(parsed);
}

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-08" → "Aug 2026". */
export function formatMonth(yearMonth: string): string {
  const parsed = new Date(`${yearMonth}-01`);
  if (Number.isNaN(parsed.getTime())) return yearMonth;
  return MONTH_FORMAT.format(parsed);
}

export function calendarMonth(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone,
  }).format(date);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from one civil date to the other, both read as UTC midnight
 * like `formatDate` — so the gap never shifts with the reader's timezone.
 * `null` when either date is unparseable. */
export function daysBetween(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / MS_PER_DAY);
}

/** How cold a project has gone, in the coarsest unit that still says
 * something: "Today", "Yesterday", "6 days ago", "3 weeks ago". Weeks and
 * months are floored, so the label never rounds a gap up into a longer one
 * than the climber actually left. */
export function describeDaysAgo(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${formatCount(days, "day")} ago`;
  if (days < 30) return `${formatCount(Math.floor(days / 7), "week")} ago`;
  if (days < 365) return `${formatCount(Math.floor(days / 30), "month")} ago`;
  return `${formatCount(Math.floor(days / 365), "year")} ago`;
}
