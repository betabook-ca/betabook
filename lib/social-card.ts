import type { AnalyticsSendRow } from "@/db/queries";
import { buildAnalyticsHighlights, type HighlightSession } from "@/lib/analytics-highlights";
import { calendarCountsForDisciplines } from "@/lib/calendar-activity";
import { formatDate, formatMonth } from "@/lib/format-date";
import { formatGrade, type ClimbType } from "@/lib/grades";
import {
  buildUserAnalytics,
  DISCIPLINE_ORDER,
  type AnalyticsJournalSession,
} from "@/lib/user-analytics";

export type SocialCardPeriod = "month" | "year" | "all";
type SocialCardSend = AnalyticsSendRow & { rating?: number | null };

export function isSocialCardPeriod(value: unknown): value is SocialCardPeriod {
  return value === "month" || value === "year" || value === "all";
}

export function isYearInReviewMonth(today: string): boolean {
  return /^\d{4}-12-\d{2}$/.test(today);
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
  return formatMonth(today.slice(0, 7));
}

export type SocialCardCalendar = {
  year: number;
  /** Current years stop at today instead of showing empty future months. */
  throughDate: string;
  /** The selected month is emphasized within the full-year calendar. */
  highlightMonth: number | null;
  label: string;
  counts: Record<string, number>;
};

export type SocialCardStats = {
  period: SocialCardPeriod;
  periodLabel: string;
  sendCount: number;
  daysOut: number;
  /** Send count and hardest completed climb per discipline in this period. */
  disciplines: {
    type: ClimbType;
    sendCount: number;
    hardest: { climbId: number; grade: string; climbName: string } | null;
    favorites: { climbId: number; climbName: string; rating: number; grade: string | null }[];
  }[];
  /** Omitted on older frozen snapshots. Every actual lifetime grade record in
   * the chosen period is retained for the linked recap's milestone page. */
  breakthroughs?: {
    type: ClimbType;
    grade: string;
    climbName: string;
    dateSent: string;
  }[];
  highlights?: {
    id: "partner" | "mostSessioned" | "busiestDay" | "persistence" | "favoriteRepeat";
    label: string;
    value: string;
    detail: string;
  }[];
  favoriteClimbs?: {
    climbId: number;
    climbName: string;
    type: ClimbType;
    rating: number;
    grade: string | null;
  }[];
  calendar: SocialCardCalendar;
  longestStreak: number | null;
  firstTryPct?: number | null;
  busiestMonth?: { month: string; count: number } | null;
};

export type SocialCardCoverHighlight = {
  id: "firstTry" | "peakMonth" | "streak" | "topRated" | "daysOut" | "hardest";
  label: string;
  value: string;
  detail: string;
};

/** Fill a one- or two-discipline cover with real Analytics highlights so
 * the hook image and linked page keep the same three-card rhythm. */
export function socialCardCoverHighlights(stats: SocialCardStats): SocialCardCoverHighlight[] {
  // One discipline uses separate Sends and Hardest cards, leaving one slot.
  const needed = stats.disciplines.length === 1 ? 1 : Math.max(0, 3 - stats.disciplines.length);
  if (needed === 0) return [];
  const candidates: SocialCardCoverHighlight[] = [];
  if (stats.firstTryPct != null) {
    candidates.push({
      id: "firstTry",
      label: stats.disciplines[0]?.type === "boulder" ? "Flash rate" : "First try",
      value: `${stats.firstTryPct}%`,
      detail: stats.disciplines[0]?.type === "boulder" ? "of boulder sends" : "flash or onsight",
    });
  }
  if (stats.busiestMonth) {
    const [month] = formatMonth(stats.busiestMonth.month).split(" ");
    candidates.push({
      id: "peakMonth",
      label: "Peak month",
      value: month,
      detail: `${stats.busiestMonth.count} sends`,
    });
  }
  if (stats.longestStreak != null && stats.longestStreak > 1) {
    candidates.push({
      id: "streak",
      label: "Longest streak",
      value: String(stats.longestStreak),
      detail: "days in a row",
    });
  }
  const favorite = stats.disciplines.flatMap((discipline) => discipline.favorites)[0];
  if (favorite) {
    candidates.push({
      id: "topRated",
      label: "Top rated",
      value: `${favorite.rating} ★`,
      detail: favorite.climbName,
    });
  }
  candidates.push({
    id: "daysOut",
    label: "Climbing days",
    value: String(stats.daysOut),
    detail: "this period",
  });
  const hardest = stats.disciplines.find((discipline) => discipline.hardest)?.hardest;
  if (hardest) {
    candidates.push({
      id: "hardest",
      label: "Hardest send",
      value: hardest.grade,
      detail: hardest.climbName,
    });
  }
  return candidates.slice(0, needed);
}

function buildSocialCardCalendar(
  sends: readonly AnalyticsSendRow[],
  sessions: readonly AnalyticsJournalSession[] | undefined,
  period: SocialCardPeriod,
  today: string,
): SocialCardCalendar {
  const counts = calendarCountsForDisciplines(sends, sessions, DISCIPLINE_ORDER);
  const currentYear = Number(today.slice(0, 4));
  let year = currentYear;
  if (period === "all") {
    const daysByYear = new Map<number, number>();
    for (const [date, count] of Object.entries(counts)) {
      if (count <= 0) continue;
      const activeYear = Number(date.slice(0, 4));
      daysByYear.set(activeYear, (daysByYear.get(activeYear) ?? 0) + 1);
    }
    for (const [candidate, days] of daysByYear) {
      if (
        days > (daysByYear.get(year) ?? 0) ||
        (days === daysByYear.get(year) && candidate > year)
      ) {
        year = candidate;
      }
    }
  }
  return {
    year,
    throughDate: year === currentYear ? today : `${year}-12-31`,
    highlightMonth: period === "month" ? Number(today.slice(5, 7)) : null,
    label:
      period === "all"
        ? `MOST ACTIVE YEAR · ${year}`
        : period === "month"
          ? `${formatMonth(today.slice(0, 7)).toUpperCase()} IN FOCUS`
          : `${year} TO DATE`,
    counts: Object.fromEntries(
      Object.entries(counts).filter(([date]) => date.startsWith(`${year}-`)),
    ),
  };
}

function emptyStats(
  period: SocialCardPeriod,
  today: string,
  calendar: SocialCardCalendar,
): SocialCardStats {
  return {
    period,
    periodLabel: socialCardPeriodLabel(period, today),
    sendCount: 0,
    daysOut: 0,
    disciplines: [],
    breakthroughs: [],
    highlights: [],
    favoriteClimbs: [],
    calendar,
    longestStreak: null,
    firstTryPct: null,
    busiestMonth: null,
  };
}

function rankedRatedSends(sends: readonly SocialCardSend[], type?: ClimbType) {
  const ranked = sends
    .filter(
      (send): send is SocialCardSend & { rating: number } =>
        (type === undefined || send.climbType === type) &&
        typeof send.rating === "number" &&
        send.rating >= 1 &&
        send.rating <= 5,
    )
    .sort(
      (a, b) =>
        b.rating - a.rating ||
        (type === undefined
          ? (b.dateSent ?? "").localeCompare(a.dateSent ?? "")
          : (b.suggestedGrade ?? -1) - (a.suggestedGrade ?? -1)) ||
        a.climbName.localeCompare(b.climbName),
    );
  const seen = new Set<number>();
  return ranked.filter((send) => {
    if (seen.has(send.climbId)) return false;
    seen.add(send.climbId);
    return true;
  });
}

function topRatedClimbs(sends: readonly SocialCardSend[], type: ClimbType) {
  return rankedRatedSends(sends, type)
    .slice(0, 3)
    .map((send) => {
      const grade = formatGrade(type, send.suggestedGrade);
      return {
        climbId: send.climbId,
        climbName: send.climbName,
        rating: send.rating,
        grade: grade === "—" ? null : grade,
      };
    });
}

function topRatedClimbsAcrossDisciplines(sends: readonly SocialCardSend[]) {
  return rankedRatedSends(sends)
    .slice(0, 6)
    .map((send) => {
      const grade = formatGrade(send.climbType, send.suggestedGrade);
      return {
        climbId: send.climbId,
        climbName: send.climbName,
        type: send.climbType,
        rating: send.rating,
        grade: grade === "—" ? null : grade,
      };
    });
}

function recapAnalyticsHighlights(rows: readonly HighlightSession[]) {
  const analytics = buildAnalyticsHighlights(rows, "all", []);
  const result: NonNullable<SocialCardStats["highlights"]> = [];
  const sessionsByDay = new Map<string, number>();
  for (const row of rows) {
    sessionsByDay.set(row.entryDate, (sessionsByDay.get(row.entryDate) ?? 0) + 1);
  }
  const busiestDay = [...sessionsByDay.entries()].toSorted(
    ([dateA, countA], [dateB, countB]) => countB - countA || dateB.localeCompare(dateA),
  )[0];
  if (analytics.partner) {
    result.push({
      id: "partner",
      label: "Favorite partner",
      value: analytics.partner.name,
      detail: `${analytics.partner.days} shared ${analytics.partner.days === 1 ? "day" : "days"}`,
    });
  }
  if (analytics.biggestProject) {
    result.push({
      id: "mostSessioned",
      label: "Most sessioned climb",
      value: analytics.biggestProject.name,
      detail: `${analytics.biggestProject.sessions} ${analytics.biggestProject.sessions === 1 ? "session" : "sessions"}`,
    });
  }
  if (busiestDay) {
    result.push({
      id: "busiestDay",
      label: "Most sessions in a day",
      value: `${busiestDay[1]} ${busiestDay[1] === 1 ? "session" : "sessions"}`,
      detail: formatDate(busiestDay[0]),
    });
  }
  if (analytics.persistence && analytics.persistence.id !== analytics.biggestProject?.id) {
    result.push({
      id: "persistence",
      label: "Persistence paid off",
      value: analytics.persistence.name,
      detail: `${analytics.persistence.attempts} sessions through the send`,
    });
  }
  if (analytics.favoriteRepeat && analytics.favoriteRepeat.id !== analytics.biggestProject?.id) {
    result.push({
      id: "favoriteRepeat",
      label: "Favorite repeat",
      value: analytics.favoriteRepeat.name,
      detail: `${analytics.favoriteRepeat.repeats} ${analytics.favoriteRepeat.repeats === 1 ? "repeat" : "repeats"}`,
    });
  }
  return result.slice(0, 4);
}

/** Headline stats for a shareable recap card, scoped to a month/year/all-time
 * period across every discipline combined — a climbing recap, not a
 * boulder-only or sport-only one. Reuses `buildUserAnalytics` for headline and
 * hardest-send aggregation, then counts disciplines from the same period slice.
 * Pre-filtering rather than passing `selectedYears` supplies month granularity. */
export function buildSocialCardStats(
  allSends: readonly SocialCardSend[],
  allJournalSessions: readonly AnalyticsJournalSession[] | undefined,
  period: SocialCardPeriod,
  today: string,
  allHighlightSessions: readonly HighlightSession[] = [],
): SocialCardStats {
  const sends = allSends.filter((send) => inPeriod(send.dateSent, period, today));
  const journalSessions = allJournalSessions?.filter((session) =>
    inPeriod(session.entryDate, period, today),
  );
  const calendar = buildSocialCardCalendar(allSends, allJournalSessions, period, today);
  const highlightSessions = allHighlightSessions.filter((session) =>
    inPeriod(session.entryDate, period, today),
  );
  if (sends.length === 0 && (journalSessions?.length ?? 0) === 0) {
    return emptyStats(period, today, calendar);
  }

  const analytics = buildUserAnalytics(sends, "all", journalSessions, []);
  // Breakthroughs are lifetime personal bests. A period-only calculation
  // would incorrectly call its first climb a new record.
  const lifetimeBreakthroughs =
    period === "all"
      ? analytics.breakthroughs
      : buildUserAnalytics([...allSends], "all").breakthroughs;
  return {
    period,
    periodLabel: socialCardPeriodLabel(period, today),
    sendCount: analytics.sendCount,
    daysOut: analytics.daysOut,
    breakthroughs: lifetimeBreakthroughs
      .filter(
        (breakthrough) =>
          breakthrough.waitDays !== null && inPeriod(breakthrough.dateSent, period, today),
      )
      .map((breakthrough) => ({
        type: breakthrough.type,
        grade: breakthrough.label,
        climbName: breakthrough.climbName,
        dateSent: breakthrough.dateSent,
      })),
    highlights: recapAnalyticsHighlights(highlightSessions),
    favoriteClimbs: topRatedClimbsAcrossDisciplines(sends),
    disciplines: analytics.disciplines.map((type) => {
      const hardest = analytics.hardest.find((send) => send.type === type);
      return {
        type,
        sendCount: sends.filter((send) => send.climbType === type).length,
        hardest: hardest
          ? { climbId: hardest.climbId, grade: hardest.label, climbName: hardest.climbName }
          : null,
        favorites: topRatedClimbs(sends, type),
      };
    }),
    calendar,
    longestStreak: analytics.longestStreak?.days ?? null,
    firstTryPct: analytics.sendCount
      ? Math.round((analytics.firstTryCount / analytics.sendCount) * 100)
      : null,
    busiestMonth: analytics.busiestMonth,
  };
}
