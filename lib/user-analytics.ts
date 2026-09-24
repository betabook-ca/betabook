import type { AnalyticsSendRow } from "@/db/queries";
import { daysBetween } from "@/lib/format-date";
import { nativeGradeArray, type ClimbType } from "@/lib/grades";
import type { AscentStyle } from "@/lib/sends";

/** Which slice of a climber's log the analytics page is reading — grades
 * only compare within one discipline, so "all" keeps per-discipline
 * groupings for every grade-axis chart while the volume stats merge. */
export type DisciplineScope = ClimbType | "all";

export const DISCIPLINE_ORDER: readonly ClimbType[] = ["boulder", "sport", "trad"];

export function parseDisciplineScope(value: string | undefined): DisciplineScope {
  return value === "boulder" || value === "sport" || value === "trad" ? value : "all";
}

type HardestSend = {
  type: ClimbType;
  grade: number;
  label: string;
  climbId: number;
  climbName: string;
  dateSent: string | null;
};

export type ProgressionPoint = {
  /** YYYY-MM */
  month: string;
  /** Hardest dated send that month (grade ordinal). */
  hardest: number;
  /** Running personal best through that month. */
  best: number;
};

type DisciplineProgression = { type: ClimbType; points: ProgressionPoint[] };

export type PyramidRow = { grade: number; label: string; count: number };
/** Rows run hardest → easiest, zeros kept, so the shape reads as the
 * classic send pyramid: thin peak on top, base underneath. */
type DisciplinePyramid = { type: ClimbType; rows: PyramidRow[] };

export type Breakthrough = {
  type: ClimbType;
  grade: number;
  label: string;
  climbId: number;
  climbName: string;
  dateSent: string;
  /** Days since the previous ceiling-raise in this discipline. */
  waitDays: number | null;
};

export type MonthlyVolume = { month: string; sends: number; days: number };
export type FirstTryGradeRow = {
  grade: number;
  label: string;
  sends: number;
  /** Flashes plus onsights at this grade. */
  firstTries: number;
  rate: number;
};

/** Anything but a redpoint counts toward the flash rate: a flash, or an onsight on ropes. */
function isFirstTry(style: AscentStyle): boolean {
  return style !== "redpoint";
}

export type UserAnalytics = {
  volume: MonthlyVolume[];
  firstTryByGrade: { type: ClimbType; rows: FirstTryGradeRow[] }[];
  scope: DisciplineScope;
  sendCount: number;
  datelessCount: number;
  dateSpan: [string, string] | null;
  /** Disciplines present in scope, boulder → sport → trad. */
  disciplines: ClimbType[];
  /** Hardest send per discipline present (grades don't compare across). */
  hardest: HardestSend[];
  flashCount: number;
  onsightCount: number;
  /** flashCount + onsightCount. */
  firstTryCount: number;
  /** Hardest flash-or-onsight — only when the scope is one discipline. */
  hardestFirstTry: HardestSend | null;
  daysOut: number;
  daysPerMonth: number | null;
  bestYear: { year: number; count: number } | null;
  areaCount: number;
  topArea: { id: number; name: string; count: number } | null;
  progression: DisciplineProgression[];
  pyramid: DisciplinePyramid[];
  /** Every send that raised a ceiling, newest first. */
  breakthroughs: Breakthrough[];
  calendarCounts: Record<string, number>;
  calendarYears: number[];
  /** Years with dated sends, ascending. */
  years: number[];
  longestStreak: { days: number; end: string } | null;
  longestLayoff: { days: number; from: string; to: string } | null;
  busiestMonth: { month: string; count: number } | null;
  favoriteWeekday: { weekday: string; count: number } | null;
};

export type AnalyticsJournalSession = {
  entryDate: string;
  climbType: ClimbType | null;
  count?: number;
};

/** Lightweight page metadata; kept separate from chart/stat calculations. */
export function getAnalyticsHistorySummary(
  sends: readonly AnalyticsSendRow[],
  scope: DisciplineScope,
  sessions?: readonly AnalyticsJournalSession[],
) {
  const years = new Set<number>();
  let undatedCount = 0;
  for (const send of sends) {
    if (send.dateSent != null) years.add(Number(send.dateSent.slice(0, 4)));
    else if (scope === "all" || send.climbType === scope) undatedCount += 1;
  }
  // Include session-only years and other disciplines so switching disciplines
  // never silently removes a year from the picker.
  for (const session of sessions ?? []) years.add(Number(session.entryDate.slice(0, 4)));
  return { years: [...years].sort((a, b) => b - a), undatedCount };
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
/** Humanized gap for breakthrough waits and layoffs: "12d", "4 mo", "2.2 yr". */
export function formatDaySpan(days: number): string {
  if (days < 1) return "same day";
  if (days < 45) return `${Math.round(days)}d`;
  if (days < 540) return `${Math.round(days / 30.437)} mo`;
  return `${(days / 365.25).toFixed(1)} yr`;
}

/** Sends of one discipline graded on its scale, each carrying its grade. The
 * one grade source behind every chart here: mixing climbs.grade into any of
 * them inverts a pyramid or strands a breakthrough above the progression
 * line. Generic so a caller's `dateSent` narrowing survives. */
function gradedSends<T extends AnalyticsSendRow>(
  sends: T[],
  type: ClimbType,
): (T & { grade: number })[] {
  const scale = nativeGradeArray(type);
  const graded: (T & { grade: number })[] = [];
  for (const s of sends) {
    const grade = s.suggestedGrade;
    if (s.climbType !== type || grade == null || grade < 0 || grade >= scale.length) continue;
    graded.push({ ...s, grade });
  }
  return graded;
}

/** One discipline's send pyramid from any slice of a log (all time, or one
 * year's sends): counts per grade from the slice's hardest down to its
 * easiest, zeros kept so the shape is real. */
export function buildPyramid(sends: AnalyticsSendRow[], type: ClimbType): PyramidRow[] {
  const scale = nativeGradeArray(type);
  const gradeCounts = new Map<number, number>();
  for (const s of gradedSends(sends, type)) {
    gradeCounts.set(s.grade, (gradeCounts.get(s.grade) ?? 0) + 1);
  }
  if (gradeCounts.size === 0) return [];

  const indices = [...gradeCounts.keys()];
  const min = Math.min(...indices);
  const max = Math.max(...indices);
  const rows: PyramidRow[] = [];
  for (let grade = max; grade >= min; grade -= 1) {
    rows.push({ grade, label: scale[grade], count: gradeCounts.get(grade) ?? 0 });
  }
  return rows;
}

/** Whether a logged date falls inside a fixed window, inclusive at both ends.
 *
 * Deliberately unlike `inSelectedYears` in the one way that matters: an
 * undated row is excluded rather than admitted. An empty year selection means
 * "all years", so a null date belongs there; a trip is a claim about two
 * specific days, and a send with no date cannot be shown to fall between them.
 *
 * Callers filter their rows with this *before* `buildUserAnalytics` and pass no
 * selected years, so every stat below is computed over the window alone. */
export function inDateWindow(date: string | null, from: string, to: string): boolean {
  return date != null && date >= from && date <= to;
}

/** An empty selection is All years, which includes undated rows. */
export function inSelectedYears(date: string | null, selectedYears: readonly number[]): boolean {
  return (
    selectedYears.length === 0 || (date != null && selectedYears.includes(Number(date.slice(0, 4))))
  );
}

/** Aggregates one user's full send log into everything the analytics page
 * shows, filtered to `scope` and optionally selected years. Pure — see user-analytics.test.ts. */
// oxlint-disable-next-line complexity -- one branch per independent stat computed in a single pass
export function buildUserAnalytics(
  allSends: AnalyticsSendRow[],
  scope: DisciplineScope,
  journalSessions?: readonly AnalyticsJournalSession[],
  selectedYears: readonly number[] = [],
): UserAnalytics {
  const sends = allSends.filter(
    (s) => (scope === "all" || s.climbType === scope) && inSelectedYears(s.dateSent, selectedYears),
  );
  const periodSessions = journalSessions?.filter((session) =>
    inSelectedYears(session.entryDate, selectedYears),
  );
  const dated = sends
    .filter((s): s is AnalyticsSendRow & { dateSent: string } => s.dateSent != null)
    .sort((a, b) => (a.dateSent < b.dateSent ? -1 : a.dateSent > b.dateSent ? 1 : 0));

  const disciplines = DISCIPLINE_ORDER.filter((d) => sends.some((s) => s.climbType === d));

  // Hardest send per discipline — first (earliest-dated) send at the top grade.
  const hardest: HardestSend[] = [];
  for (const type of disciplines) {
    const scale = nativeGradeArray(type);
    const graded = gradedSends(sends, type);
    if (graded.length === 0) continue;
    let top = graded[0];
    for (const s of graded.slice(1)) {
      if (s.grade > top.grade) {
        top = s;
      } else if (s.grade === top.grade && s.dateSent != null) {
        if (top.dateSent == null || s.dateSent < top.dateSent) {
          top = s;
        }
      }
    }
    hardest.push({
      type,
      grade: top.grade,
      label: scale[top.grade],
      climbId: top.climbId,
      climbName: top.climbName,
      dateSent: top.dateSent,
    });
  }

  const flashCount = sends.filter((s) => s.ascentStyle === "flash").length;
  const onsightCount = sends.filter((s) => s.ascentStyle === "onsight").length;
  let hardestFirstTry: HardestSend | null = null;
  if (scope !== "all") {
    const scale = nativeGradeArray(scope);
    const firstTries = gradedSends(sends, scope).filter((s) => isFirstTry(s.ascentStyle));
    if (firstTries.length > 0) {
      let top = firstTries[0];
      for (const s of firstTries.slice(1)) {
        if (s.grade > top.grade) {
          top = s;
        }
      }
      hardestFirstTry = {
        type: scope,
        grade: top.grade,
        label: scale[top.grade],
        climbId: top.climbId,
        climbName: top.climbName,
        dateSent: top.dateSent,
      };
    }
  }

  const sendsByDay: Record<string, number> = {};
  for (const s of dated) sendsByDay[s.dateSent] = (sendsByDay[s.dateSent] ?? 0) + 1;
  const sendDays = Object.keys(sendsByDay).sort();
  const sessionCounts: Record<string, number> = {};
  if (periodSessions !== undefined) {
    for (const session of periodSessions) {
      if (scope !== "all" && session.climbType !== scope) continue;
      sessionCounts[session.entryDate] =
        (sessionCounts[session.entryDate] ?? 0) + (session.count ?? 1);
    }
  }
  const calendarCounts = periodSessions === undefined ? sendsByDay : sessionCounts;
  const days = Object.keys(calendarCounts).sort();
  const calendarYears = [...new Set(days.map((day) => Number(day.slice(0, 4))))].sort(
    (a, b) => a - b,
  );
  const years = [...new Set(sendDays.map((d) => Number(d.slice(0, 4))))].sort((a, b) => a - b);

  const dateSpan: [string, string] | null =
    sendDays.length > 0 ? [sendDays[0], sendDays[sendDays.length - 1]] : null;

  let daysPerMonth: number | null = null;
  if (days.length > 0) {
    const [fy, fm] = days[0].split("-").map(Number);
    const [ly, lm] = days[days.length - 1].split("-").map(Number);
    const monthSpan = (ly - fy) * 12 + (lm - fm) + 1;
    daysPerMonth = days.length / monthSpan;
  }

  let longestStreak: UserAnalytics["longestStreak"] = null;
  let longestLayoff: UserAnalytics["longestLayoff"] = null;
  let streak = 1;
  for (let i = 0; i < days.length; i += 1) {
    if (i > 0) {
      const gap = daysBetween(days[i - 1], days[i]) ?? 0;
      streak = gap === 1 ? streak + 1 : 1;
      // A gap of 1 is back-to-back climbing days, not a break — only an
      // actual day off the wall counts, so a climber who never missed a day
      // reports no layoff rather than "1d".
      if (gap > 1 && (!longestLayoff || gap > longestLayoff.days)) {
        longestLayoff = { days: gap, from: days[i - 1], to: days[i] };
      }
    }
    if (!longestStreak || streak > longestStreak.days) {
      longestStreak = { days: streak, end: days[i] };
    }
  }

  const byYear = new Map<number, number>();
  const byMonth = new Map<string, number>();
  const byWeekday = new Map<number, number>();
  for (const s of dated) {
    const year = Number(s.dateSent.slice(0, 4));
    const month = s.dateSent.slice(0, 7);
    const weekday = new Date(`${s.dateSent}T00:00:00Z`).getUTCDay();
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
    byWeekday.set(weekday, (byWeekday.get(weekday) ?? 0) + 1);
  }
  const daysByMonth = new Map<string, number>();
  for (const day of days)
    daysByMonth.set(day.slice(0, 7), (daysByMonth.get(day.slice(0, 7)) ?? 0) + 1);
  const activeMonths = [...new Set([...byMonth.keys(), ...daysByMonth.keys()])].sort();
  const volume: MonthlyVolume[] = [];
  if (activeMonths.length) {
    const index = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
    for (
      let m = index(activeMonths[0]);
      m <= index(activeMonths[activeMonths.length - 1]);
      m += 1
    ) {
      const year = Math.floor(m / 12);
      if (selectedYears.length && !selectedYears.includes(year)) continue;
      const month = `${year}-${String((m % 12) + 1).padStart(2, "0")}`;
      volume.push({ month, sends: byMonth.get(month) ?? 0, days: daysByMonth.get(month) ?? 0 });
    }
  }
  const firstTryByGrade = disciplines.map((type) => {
    const grades = new Map<number, FirstTryGradeRow>();
    for (const send of gradedSends(sends, type)) {
      const row = grades.get(send.grade) ?? {
        grade: send.grade,
        label: nativeGradeArray(type)[send.grade],
        sends: 0,
        firstTries: 0,
        rate: 0,
      };
      row.sends += 1;
      if (isFirstTry(send.ascentStyle)) row.firstTries += 1;
      row.rate = (row.firstTries / row.sends) * 100;
      grades.set(send.grade, row);
    }
    return { type, rows: [...grades.values()].sort((a, b) => a.grade - b.grade) };
  });
  const bestYear = maxEntry(byYear, (year, count) => ({ year, count }));
  const busiestMonth = maxEntry(byMonth, (month, count) => ({ month, count }));
  const favoriteWeekday = maxEntry(byWeekday, (weekday, count) => ({
    weekday: WEEKDAYS[weekday],
    count,
  }));

  // Areas.
  const areaCounts = new Map<number, { id: number; name: string; count: number }>();
  for (const s of sends) {
    const entry = areaCounts.get(s.areaId) ?? { id: s.areaId, name: s.areaName, count: 0 };
    entry.count += 1;
    areaCounts.set(s.areaId, entry);
  }
  let topArea: UserAnalytics["topArea"] = null;
  for (const entry of areaCounts.values()) {
    if (!topArea || entry.count > topArea.count) topArea = entry;
  }

  // Grade-axis charts, one group per discipline.
  const progression: DisciplineProgression[] = [];
  const pyramid: DisciplinePyramid[] = [];
  const breakthroughs: Breakthrough[] = [];
  for (const type of disciplines) {
    const scale = nativeGradeArray(type);
    // Easiest first inside a day: same-day sends carry no order of their own,
    // so insert order would otherwise pick which ceilings count.
    const graded = gradedSends(dated, type).sort((a, b) =>
      a.dateSent < b.dateSent ? -1 : a.dateSent > b.dateSent ? 1 : a.grade - b.grade,
    );

    const hardestByMonth = new Map<string, number>();
    for (const s of graded) {
      const month = s.dateSent.slice(0, 7);
      hardestByMonth.set(month, Math.max(hardestByMonth.get(month) ?? 0, s.grade));
    }
    const months = [...hardestByMonth.keys()].sort();
    const points: ProgressionPoint[] = [];
    for (const month of months) {
      const monthHardest = hardestByMonth.get(month) ?? 0;
      const prevBest = points.length > 0 ? points[points.length - 1].best : 0;
      points.push({ month, hardest: monthHardest, best: Math.max(prevBest, monthHardest) });
    }
    if (points.length > 0) progression.push({ type, points });

    const rows = buildPyramid(sends, type);
    if (rows.length > 0) pyramid.push({ type, rows });

    let ceiling = -1;
    let previousDate: string | null = null;
    for (const s of graded) {
      if (s.grade <= ceiling) continue;
      breakthroughs.push({
        type,
        grade: s.grade,
        label: scale[s.grade],
        climbId: s.climbId,
        climbName: s.climbName,
        dateSent: s.dateSent,
        waitDays: previousDate == null ? null : daysBetween(previousDate, s.dateSent),
      });
      ceiling = s.grade;
      previousDate = s.dateSent;
    }
  }
  // Hardest first inside a day, or two ceilings raised on one day print
  // easiest on top and read as a step backwards.
  breakthroughs.sort((a, b) =>
    a.dateSent < b.dateSent ? 1 : a.dateSent > b.dateSent ? -1 : b.grade - a.grade,
  );

  return {
    volume,
    firstTryByGrade,
    scope,
    sendCount: sends.length,
    datelessCount: sends.length - dated.length,
    dateSpan,
    disciplines,
    hardest,
    flashCount,
    onsightCount,
    firstTryCount: flashCount + onsightCount,
    hardestFirstTry,
    daysOut: days.length,
    daysPerMonth,
    bestYear,
    areaCount: areaCounts.size,
    topArea,
    progression,
    pyramid,
    breakthroughs,
    calendarCounts,
    calendarYears,
    years,
    longestStreak,
    longestLayoff,
    busiestMonth,
    favoriteWeekday,
  };
}

function maxEntry<K, V>(map: Map<K, number>, make: (key: K, count: number) => V): V | null {
  let best: { key: K; count: number } | null = null;
  for (const [key, count] of map) {
    if (!best || count > best.count) best = { key, count };
  }
  return best ? make(best.key, best.count) : null;
}
