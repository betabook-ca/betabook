import type { AnalyticsSendRow } from "@/db/queries";
import type { ClimbType } from "@/lib/grades";
import {
  buildUserAnalytics,
  DISCIPLINE_ORDER,
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

export type SocialCardStats = {
  period: SocialCardPeriod;
  periodLabel: string;
  /** The discipline with the most activity in the period; null with none. */
  scope: ClimbType | null;
  sendCount: number;
  daysOut: number;
  hardest: { label: string; climbName: string } | null;
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
    scope: null,
    sendCount: 0,
    daysOut: 0,
    hardest: null,
    areaCount: 0,
    topArea: null,
    flashPct: null,
    longestStreak: null,
  };
}

/** Headline stats for a shareable recap card, scoped to a month/year/all-time
 * period and — like the analytics page itself — to whichever discipline was
 * most active in it, since grades only compare within one discipline. Reuses
 * `buildUserAnalytics` for the actual aggregation rather than recomputing it,
 * pre-filtering to the period instead of passing `selectedYears`: analytics
 * only filters by year, and a recap card also needs month granularity. */
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

  const volume = (type: ClimbType) =>
    journalSessions
      ? journalSessions
          .filter((session) => session.climbType === type)
          .reduce((total, session) => total + (session.count ?? 1), 0)
      : sends.filter((send) => send.climbType === type).length;
  const present = DISCIPLINE_ORDER.filter(
    (type) =>
      sends.some((send) => send.climbType === type) ||
      journalSessions?.some((session) => session.climbType === type),
  );
  const scope = [...present].sort((a, b) => volume(b) - volume(a))[0];
  if (scope === undefined) return emptyStats(period, today);

  const analytics = buildUserAnalytics(sends, scope, journalSessions, []);
  const hardest = analytics.hardest[0] ?? null;
  return {
    period,
    periodLabel: socialCardPeriodLabel(period, today),
    scope,
    sendCount: analytics.sendCount,
    daysOut: analytics.daysOut,
    hardest: hardest ? { label: hardest.label, climbName: hardest.climbName } : null,
    areaCount: analytics.areaCount,
    topArea: analytics.topArea ? { name: analytics.topArea.name } : null,
    flashPct: analytics.sendCount
      ? Math.round((analytics.firstTryCount / analytics.sendCount) * 100)
      : null,
    longestStreak: analytics.longestStreak?.days ?? null,
  };
}
