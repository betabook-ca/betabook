import type { AnalyticsSendRow } from "@/db/queries";
import type { ClimbType } from "@/lib/grades";
import {
  buildUserAnalytics,
  formatMonthLabel,
  type AnalyticsJournalSession,
} from "@/lib/user-analytics";

export type SocialCardPeriod = "month" | "year" | "all";

export const SOCIAL_CARD_PERIODS: readonly { id: SocialCardPeriod; label: string }[] = [
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
];

export function isSocialCardPeriod(value: unknown): value is SocialCardPeriod {
  return value === "month" || value === "year" || value === "all";
}

/** `today` is the viewer's local date (YYYY-MM-DD, as `Intl.DateTimeFormat`
 * with the request's Cloudflare timezone already gives the analytics page)
 * so "this month" matches the calendar the climber is looking at, not UTC. */
function inPeriod(date: string | null, period: SocialCardPeriod, today: string): boolean {
  if (period === "all") return true;
  if (date == null) return false;
  return period === "year"
    ? date.slice(0, 4) === today.slice(0, 4)
    : date.slice(0, 7) === today.slice(0, 7);
}

export function socialCardPeriodLabel(period: SocialCardPeriod, today: string): string {
  if (period === "all") return "All time";
  if (period === "year") return today.slice(0, 4);
  return formatMonthLabel(today.slice(0, 7));
}

export type SocialCardPyramidRow = { grade: number; label: string; count: number };
export type SocialCardPyramid = { type: ClimbType; rows: SocialCardPyramidRow[] };

/** How many grade rungs a discipline's pyramid shows on the card, hardest
 * first — a full pyramid can run dozens of rungs deep, which reads fine as
 * a chart on the analytics page but would dwarf everything else on a
 * portrait recap card. Capping (rather than, say, only the top grade) keeps
 * the shape a real pyramid, gaps and all, just a shorter one. */
const PYRAMID_ROWS_SHOWN = 5;

export type SocialCardStats = {
  period: SocialCardPeriod;
  periodLabel: string;
  sendCount: number;
  daysOut: number;
  /** One pyramid per discipline present, boulder → sport → trad, each
   * capped to its top `PYRAMID_ROWS_SHOWN` rungs — grades don't compare
   * across disciplines, so a card combining all three never has one
   * pyramid, only one per discipline. */
  pyramid: SocialCardPyramid[];
  areaCount: number;
  topArea: { name: string } | null;
  /** Percent of sends flashed or onsighted, rounded; null with no sends. */
  flashPct: number | null;
  longestStreak: number | null;
};

function emptyStats(period: SocialCardPeriod, today: string): SocialCardStats {
  return {
    period,
    periodLabel: socialCardPeriodLabel(period, today),
    sendCount: 0,
    daysOut: 0,
    pyramid: [],
    areaCount: 0,
    topArea: null,
    flashPct: null,
    longestStreak: null,
  };
}

/** Headline stats for a shareable recap card, scoped to a month/year/all-time
 * period across every discipline combined — a climbing recap, not a
 * boulder-only or sport-only one. Reuses `buildUserAnalytics` for the actual
 * aggregation rather than recomputing it, pre-filtering to the period instead
 * of passing `selectedYears`: analytics only filters by year, and a recap
 * card also needs month granularity. */
export function buildSocialCardStats(
  allSends: readonly AnalyticsSendRow[],
  allJournalSessions: readonly AnalyticsJournalSession[] | undefined,
  period: SocialCardPeriod,
  today: string,
): SocialCardStats {
  const sends = allSends.filter((send) => inPeriod(send.dateSent, period, today));
  const journalSessions = allJournalSessions?.filter((session) =>
    inPeriod(session.entryDate, period, today),
  );
  if (sends.length === 0 && (journalSessions?.length ?? 0) === 0) {
    return emptyStats(period, today);
  }

  const analytics = buildUserAnalytics(sends, "all", journalSessions, []);
  return {
    period,
    periodLabel: socialCardPeriodLabel(period, today),
    sendCount: analytics.sendCount,
    daysOut: analytics.daysOut,
    pyramid: analytics.pyramid.map(({ type, rows }) => ({
      type,
      rows: rows.slice(0, PYRAMID_ROWS_SHOWN),
    })),
    areaCount: analytics.areaCount,
    topArea: analytics.topArea ? { name: analytics.topArea.name } : null,
    flashPct: analytics.sendCount
      ? Math.round((analytics.firstTryCount / analytics.sendCount) * 100)
      : null,
    longestStreak: analytics.longestStreak?.days ?? null,
  };
}
