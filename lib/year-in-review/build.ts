import type { AnalyticsSendRow } from "@/db/queries";
import { daysBetween } from "@/lib/format-date";
import { CLIMB_TYPES, gradeArray, type ClimbType, type GradePreferences } from "@/lib/grades";
import { buildPyramid } from "@/lib/user-analytics";

import { DISCIPLINE_NAMES, monthName } from "./labels";
import { rankPersonas, type PersonaMetrics } from "./personas";
import { homeArea, locate, placeOf, relatedPlaces } from "./places";
import type {
  CalendarChapter,
  DayHighlight,
  DisciplineRanking,
  GotAwayChapter,
  GradeStep,
  HomeTurfChapter,
  MissedChapter,
  NewGroundChapter,
  NewGradesChapter,
  NotWorthThePumpChapter,
  PartnerChapter,
  RankedSend,
  StylesChapter,
  TripCard,
  TripsChapter,
  YearAreaMap,
  YearChapters,
  YearReview,
  YearReviewInput,
  YearSendRow,
  YearSessionRow,
  YearTripRow,
} from "./types";

/** Thresholds for the conditional chapters, kept together so tuning is a
 * one-line change. The core chapters (intro, days, hardest, pyramids) have
 * none: they always render. */
const YEAR_THRESHOLDS = {
  calendarDays: 6,
  weekdaySendDays: 3,
  weekdayQualifying: 2,
  rampageSends: 4,
  homeTurfDays: 3,
  stylesSends: 5,
  partnerDays: 3,
  gotAwaySessions: 2,
  gotAwayLimit: 3,
  firstVisitsLimit: 5,
  pumpMaxRating: 2,
  pumpRatedForPraise: 5,
  personaDays: 6,
  firstYearBaselineDays: 30,
  rankedLimit: 3,
} as const;

type Dated<T> = T & { dateSent: string };

type DayActivity = {
  date: string;
  climbs: Set<number>;
  areas: Set<number>;
  sends: Dated<YearSendRow>[];
};

const byDate = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const monthOf = (date: string) => Number(date.slice(5, 7));
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function isDated<T extends { dateSent: string | null }>(row: T): row is Dated<T> {
  return row.dateSent != null;
}

/** Disciplines in the order of the year's send count, largest first. */
function disciplineOrder(sends: readonly YearSendRow[]): ClimbType[] {
  const counts = new Map<ClimbType, number>();
  for (const send of sends) counts.set(send.climbType, (counts.get(send.climbType) ?? 0) + 1);
  return CLIMB_TYPES.filter((type) => counts.has(type)).toSorted(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0),
  );
}

/**
 * The top `limit` sends by grade, at most `limit` rows. Ranks follow
 * competition ranking, so ties share a rank (1, 1, 3); within a grade the
 * earliest send comes first, then name.
 */
function rankSends(
  sends: readonly Dated<YearSendRow>[],
  label: (type: ClimbType, grade: number) => string,
  areas: YearAreaMap,
  limit: number = YEAR_THRESHOLDS.rankedLimit,
): RankedSend[] {
  const sorted = sends.toSorted(
    (a, b) =>
      b.grade - a.grade || byDate(a.dateSent, b.dateSent) || a.climbName.localeCompare(b.climbName),
  );
  return sorted.slice(0, limit).map((send) => ({
    rank: 1 + sorted.filter((other) => other.grade > send.grade).length,
    grade: send.grade,
    label: label(send.climbType, send.grade),
    climbId: send.climbId,
    climbName: send.climbName,
    place: placeOf(areas, send.areaId),
    dateSent: send.dateSent,
    ascentStyle: send.ascentStyle,
  }));
}

function rankings(
  sends: readonly Dated<YearSendRow>[],
  types: readonly ClimbType[],
  label: (type: ClimbType, grade: number) => string,
  areas: YearAreaMap,
): DisciplineRanking[] {
  return types.flatMap((type) => {
    const rows = rankSends(
      sends.filter((send) => send.climbType === type),
      label,
      areas,
    );
    return rows.length ? [{ type, rows }] : [];
  });
}

/** Each send's grade as a 0–100 percentile among that discipline's sends in
 * the year, tied grades sharing their mid-rank, so disciplines compare on
 * one scale. */
function relativeGrades(sends: readonly Dated<YearSendRow>[]): Map<Dated<YearSendRow>, number> {
  const result = new Map<Dated<YearSendRow>, number>();
  for (const type of CLIMB_TYPES) {
    const group = sends.filter((send) => send.climbType === type);
    for (const send of group) {
      const below = group.filter((other) => other.grade < send.grade).length;
      const equal = group.filter((other) => other.grade === send.grade).length;
      result.set(send, ((below + equal / 2) / group.length) * 100);
    }
  }
  return result;
}

function buildCalendar(
  days: readonly DayActivity[],
  yearSends: readonly Dated<YearSendRow>[],
  types: readonly ClimbType[],
  label: (type: ClimbType, grade: number) => string,
): CalendarChapter | null {
  if (days.length < YEAR_THRESHOLDS.calendarDays) return null;
  const daysByMonth = Array.from({ length: 12 }, () => 0);
  const sendsByMonth = Array.from({ length: 12 }, () => 0);
  for (const day of days) daysByMonth[monthOf(day.date) - 1] += 1;
  for (const send of yearSends) sendsByMonth[monthOf(send.dateSent) - 1] += 1;
  let peak = 0;
  for (let month = 1; month < 12; month += 1) {
    if (
      daysByMonth[month] > daysByMonth[peak] ||
      (daysByMonth[month] === daysByMonth[peak] && sendsByMonth[month] > sendsByMonth[peak])
    )
      peak = month;
  }

  const hardestMonths = types.flatMap((type) => {
    const group = yearSends.filter((send) => send.climbType === type);
    if (!group.length) return [];
    const top = Math.max(...group.map((send) => send.grade));
    const atTop = group.filter((send) => send.grade === top);
    const counts = new Map<number, Dated<YearSendRow>[]>();
    for (const send of atTop) {
      const month = monthOf(send.dateSent);
      counts.set(month, [...(counts.get(month) ?? []), send]);
    }
    const [month, inMonth] = [...counts.entries()].toSorted(
      (a, b) => b[1].length - a[1].length || a[0] - b[0],
    )[0];
    return [{ type, month, label: label(type, top), climbName: inMonth[0].climbName }];
  });

  // Peak-performance weekday: each send day keeps its best relative grade,
  // and a weekday scores the mean of those, so volume alone can't win.
  const relative = relativeGrades(yearSends);
  const bestOfDay = new Map<string, Dated<YearSendRow>>();
  for (const send of yearSends) {
    const current = bestOfDay.get(send.dateSent);
    if (!current || (relative.get(send) ?? 0) > (relative.get(current) ?? 0))
      bestOfDay.set(send.dateSent, send);
  }
  const byWeekday = Array.from({ length: 7 }, () => [] as Dated<YearSendRow>[]);
  for (const [date, send] of bestOfDay) byWeekday[weekdayOf(date)].push(send);
  const sendDays = byWeekday.map((list) => list.length);
  const scores = byWeekday.map((list) =>
    list.length >= YEAR_THRESHOLDS.weekdaySendDays
      ? list.reduce((total, send) => total + (relative.get(send) ?? 0), 0) / list.length
      : null,
  );
  const qualifying = scores.flatMap((score, weekday) => (score == null ? [] : [weekday]));
  let weekday: CalendarChapter["weekday"] = null;
  if (qualifying.length >= YEAR_THRESHOLDS.weekdayQualifying) {
    const topScore = Math.max(...qualifying.map((day) => scores[day] ?? 0));
    const leaders = qualifying.filter((day) => Math.abs((scores[day] ?? 0) - topScore) < 1e-9);
    const mostDays = Math.max(...leaders.map((day) => sendDays[day]));
    const single = new Set(yearSends.map((send) => send.climbType)).size === 1;
    weekday = {
      best: leaders.filter((day) => sendDays[day] === mostDays),
      scores,
      sendDays,
      ranked: qualifying
        .toSorted((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || sendDays[b] - sendDays[a])
        .map((day) => ({
          weekday: day,
          sendDays: sendDays[day],
        })),
      grades: single
        ? byWeekday.map((list, day) => {
            if (scores[day] == null) return null;
            const average = list.reduce((total, send) => total + send.grade, 0) / list.length;
            return label(list[0].climbType, Math.round(average));
          })
        : null,
    };
  }

  return {
    peakMonth: { month: peak + 1, days: daysByMonth[peak], sends: sendsByMonth[peak] },
    daysByMonth,
    hardestMonths,
    weekday,
  };
}

/** A boulder grade as V-points: V0 is 0, V5 is 5, VB counts as 0. Read from
 * the native Hueco ordinal, so it doesn't change with the display scale. */
function vPoints(grade: number): number {
  return Math.max(0, grade - 1);
}

/**
 * A discipline's rampage: the day with the most climbs sent, counting both
 * new sends and repeats of climbs first sent on an earlier day. Ties go to
 * the earlier date. Boulder days also tally vPoints, the V-grades of every
 * problem sent that day.
 */
function rampageFor(
  type: ClimbType,
  yearSessions: readonly YearSessionRow[],
  yearSends: readonly Dated<YearSendRow>[],
  label: (type: ClimbType, grade: number) => string,
  areas: YearAreaMap,
): DayHighlight | null {
  type Climb = { climbName: string; grade: number; areaId: number };
  const days = new Map<string, Map<number, Climb>>();
  const climbsOn = (date: string) => {
    const existing = days.get(date);
    if (existing) return existing;
    const created = new Map<number, Climb>();
    days.set(date, created);
    return created;
  };
  for (const send of yearSends) {
    if (send.climbType !== type) continue;
    climbsOn(send.dateSent).set(send.climbId, {
      climbName: send.climbName,
      grade: send.grade,
      areaId: send.areaId,
    });
  }
  // Repeats: a first ascent's own entry mirrors its send above.
  for (const session of yearSessions) {
    if (session.climbType !== type || !session.sent || session.isAscent) continue;
    const climbs = climbsOn(session.entryDate);
    if (climbs.has(session.climbId)) continue;
    climbs.set(session.climbId, {
      climbName: session.climbName,
      grade: session.climbGrade,
      areaId: session.areaId,
    });
  }
  const best = [...days.entries()]
    .filter(([, climbs]) => climbs.size >= YEAR_THRESHOLDS.rampageSends)
    .toSorted(([dateA, a], [dateB, b]) => b.size - a.size || byDate(dateA, dateB))[0];
  if (!best) return null;
  const [date, climbs] = best;
  const list = [...climbs.entries()]
    .map(([climbId, climb]) => ({ climbId, ...climb }))
    .toSorted((a, b) => b.grade - a.grade);
  const { place, roots } = locate(
    areas,
    list.map((climb) => climb.areaId),
  );
  const top = list[0];
  return {
    date,
    sends: list.length,
    place,
    roots,
    hardest: top ? { climbName: top.climbName, label: label(type, top.grade) } : null,
    vPoints:
      type === "boulder" ? list.reduce((total, climb) => total + vPoints(climb.grade), 0) : null,
    list: list.map((climb) => ({
      climbId: climb.climbId,
      climbName: climb.climbName,
      label: label(type, climb.grade),
    })),
  };
}

/** Steps up to a new grade, per discipline, over all time. */
function gradeSteps(
  sends: readonly YearSendRow[],
  type: ClimbType,
  year: number,
  label: (type: ClimbType, grade: number) => string,
  areas: YearAreaMap,
): {
  steps: GradeStep[];
  firstYear: { from: string; to: string } | null;
  ceiling: { label: string; date: string | null } | null;
} {
  const ofType = sends.filter((send) => send.climbType === type);
  const dated = ofType
    .filter(isDated)
    .toSorted((a, b) => byDate(a.dateSent, b.dateSent) || a.grade - b.grade);
  const undated = ofType.filter((send) => send.dateSent == null);
  let ceiling = undated.length ? Math.max(...undated.map((send) => send.grade)) : -1;
  let previousDate: string | null = null;
  let firstYear: { from: string; to: string } | null = null;
  const first = dated[0];
  if (first && ceiling < 0 && first.dateSent.startsWith(`${year}-`)) {
    // A first year would "unlock" every early grade; start from the best of
    // the first month instead.
    const until = shiftDate(first.dateSent, YEAR_THRESHOLDS.firstYearBaselineDays);
    const early = dated.filter((send) => send.dateSent <= until);
    const baseline = early.toSorted((a, b) => b.grade - a.grade)[0];
    ceiling = baseline.grade;
    previousDate = baseline.dateSent;
    firstYear = { from: label(type, ceiling), to: label(type, ceiling) };
  }
  const scale = (grade: number) => label(type, grade);
  const steps: GradeStep[] = [];
  let ceilingDate: string | null = previousDate;
  for (const send of dated) {
    if (send.grade <= ceiling) continue;
    if (ceiling >= 0 && scale(send.grade) === scale(ceiling)) {
      ceiling = send.grade;
      continue;
    }
    if (send.dateSent.startsWith(`${year}-`)) {
      steps.push({
        date: send.dateSent,
        label: scale(send.grade),
        climbId: send.climbId,
        climbName: send.climbName,
        place: placeOf(areas, send.areaId),
        waitDays: previousDate == null ? null : daysBetween(previousDate, send.dateSent),
      });
    }
    ceiling = send.grade;
    previousDate = send.dateSent;
    ceilingDate = send.dateSent;
  }
  if (firstYear) firstYear = { from: firstYear.from, to: scale(ceiling) };
  return {
    steps,
    firstYear: firstYear && firstYear.from !== firstYear.to ? firstYear : null,
    ceiling: ceiling >= 0 ? { label: scale(ceiling), date: ceilingDate } : null,
  };
}

function tripCard(
  trip: YearTripRow,
  allDays: ReadonlyMap<string, { areas: Set<number> }>,
  sends: readonly Dated<YearSendRow>[],
  steps: readonly GradeStep[],
  label: (type: ClimbType, grade: number) => string,
  areas: YearAreaMap,
): TripCard {
  const inWindow = (date: string) => date >= trip.startDate && date <= trip.endDate;
  const windowDays = [...allDays.entries()].filter(([date]) => inWindow(date));
  const { place, roots } = locate(
    areas,
    windowDays.flatMap(([, day]) => [...day.areas]),
  );
  const tripSends = sends.filter((send) => inWindow(send.dateSent));
  const hardest = disciplineOrder(tripSends).map((type) => {
    const top = Math.max(
      ...tripSends.filter((send) => send.climbType === type).map((s) => s.grade),
    );
    return { type, label: label(type, top) };
  });
  return {
    id: trip.id,
    name: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    climbingDays: windowDays.length,
    sends: tripSends.length,
    location: place,
    roots,
    hardest,
    newGrades: steps.filter((step) => inWindow(step.date)).length,
  };
}

function buildTrips(
  input: YearReviewInput,
  yearDays: ReadonlyMap<string, DayActivity>,
  allDays: ReadonlyMap<string, { areas: Set<number> }>,
  datedSends: readonly Dated<YearSendRow>[],
  steps: readonly GradeStep[],
  label: (type: ClimbType, grade: number) => string,
): TripsChapter | null {
  const { year, today, areas } = input;
  const cards = input.trips
    .filter((trip) => trip.startDate <= today)
    .map((trip) => tripCard(trip, allDays, datedSends, steps, label, areas));
  const thisYear = cards
    .filter((card) => card.startDate.startsWith(`${year}-`) && card.climbingDays > 0)
    .toSorted((a, b) => byDate(a.startDate, b.startDate));
  if (!thisYear.length) return null;
  const earlier = cards.filter(
    (card) => Number(card.startDate.slice(0, 4)) < year && card.location,
  );

  const tripDates = new Set<string>();
  for (const card of thisYear) {
    for (const date of yearDays.keys()) {
      if (date >= card.startDate && date <= card.endDate) tripDates.add(date);
    }
  }

  const biggest = thisYear.toSorted(
    (a, b) =>
      b.climbingDays - a.climbingDays ||
      b.sends - a.sends ||
      (daysBetween(b.startDate, b.endDate) ?? 0) - (daysBetween(a.startDate, a.endDate) ?? 0) ||
      byDate(a.startDate, b.startDate),
  )[0];

  let returnTrip: TripsChapter["returnTrip"] = null;
  for (const card of thisYear) {
    const here = card.location;
    if (!here) continue;
    const matches = earlier.filter(
      (other) => other.location && relatedPlaces(areas, here.id, other.location.id),
    );
    if (matches.length && (!returnTrip || matches.length + 1 > returnTrip.visit)) {
      returnTrip = {
        trip: card,
        visit: matches.length + 1,
        firstYear: Math.min(...matches.map((other) => Number(other.startDate.slice(0, 4)))),
      };
    }
  }

  // Group this year's trips whose locations are the same place or one inside
  // the other, named by the broadest of them.
  const groups: { anchor: number; trips: TripCard[] }[] = [];
  const depth = (id: number) => areas.get(id)?.path.length ?? 0;
  const located = thisYear
    .flatMap((card) => (card.location ? [{ card, id: card.location.id }] : []))
    .toSorted((a, b) => depth(a.id) - depth(b.id));
  for (const { card, id } of located) {
    const group = groups.find((existing) => relatedPlaces(areas, existing.anchor, id));
    if (group) group.trips.push(card);
    else groups.push({ anchor: id, trips: [card] });
  }

  return {
    trips: thisYear,
    totalDays: tripDates.size,
    biggest,
    returnTrip,
    repeatedPlaces: groups
      .filter((group) => group.trips.length >= 2)
      .map((group) => ({
        name: areas.get(group.anchor)?.name ?? "",
        trips: group.trips.toSorted((a, b) => byDate(a.startDate, b.startDate)),
      })),
  };
}

/** First visits, and the count of climbs tried for the first time (which
 * the Wanderer persona reads but the page doesn't show). */
function buildNewGround(
  input: YearReviewInput,
  yearDays: ReadonlyMap<string, DayActivity>,
): { chapter: NewGroundChapter | null; newClimbs: number } {
  const { year, areas, sends, sessions } = input;
  const yearStart = `${year}-01-01`;
  // "" sorts before every date: an undated send means "tried before".
  const firstByClimb = new Map<number, string>();
  const firstByArea = new Map<number, string>();
  const note = (climbId: number, areaId: number, date: string) => {
    const current = firstByClimb.get(climbId);
    if (current == null || date < current) firstByClimb.set(climbId, date);
    for (const id of areas.get(areaId)?.path ?? []) {
      const area = firstByArea.get(id);
      if (area == null || date < area) firstByArea.set(id, date);
    }
  };
  for (const send of sends) note(send.climbId, send.areaId, send.dateSent ?? "");
  for (const session of sessions) note(session.climbId, session.areaId, session.entryDate);

  const tried = new Set<number>();
  for (const day of yearDays.values()) for (const id of day.climbs) tried.add(id);
  const isNew = (date: string | undefined) =>
    date != null && date >= yearStart && date.startsWith(`${year}-`);
  const newClimbs = [...tried].filter((id) => isNew(firstByClimb.get(id))).length;

  // Highest new ancestors only, so a new crag with many new sectors counts
  // once. Roots (countries, regions) never count themselves; a new root's
  // children do, so a first trip abroad still lists its crag.
  const newAreas = [...firstByArea.entries()].filter(([id, date]) => {
    const path = areas.get(id)?.path ?? [];
    if (path.length <= 1 || !isNew(date)) return false;
    const parent = path[path.length - 2];
    return path.length === 2 || !isNew(firstByArea.get(parent));
  });
  if (!newAreas.length) return { chapter: null, newClimbs };

  // A day counts for a new area when any of its climbs sits inside it.
  const daysIn = new Map<number, number>();
  let days = 0;
  for (const day of yearDays.values()) {
    const inside = newAreas.filter(([id]) =>
      [...day.areas].some((areaId) => areas.get(areaId)?.path.includes(id)),
    );
    for (const [id] of inside) daysIn.set(id, (daysIn.get(id) ?? 0) + 1);
    if (inside.length) days += 1;
  }
  const firstVisits = newAreas
    .map(([id, date]) => ({ id, date, days: daysIn.get(id) ?? 0 }))
    .toSorted((a, b) => b.days - a.days || byDate(a.date, b.date))
    .slice(0, YEAR_THRESHOLDS.firstVisitsLimit)
    .flatMap(({ id, date, days: count }) => {
      const place = placeOf(areas, id);
      return place ? [{ place, date, days: count }] : [];
    });
  return { chapter: { areas: newAreas.length, days, firstVisits }, newClimbs };
}

function buildStyles(
  yearSends: readonly Dated<YearSendRow>[],
  yearSessions: readonly YearSessionRow[],
  types: readonly ClimbType[],
): StylesChapter | null {
  const disciplines = types.flatMap((type) => {
    const group = yearSends.filter((send) => send.climbType === type);
    if (group.length < YEAR_THRESHOLDS.stylesSends) return [];
    const count = (style: string) => group.filter((send) => send.ascentStyle === style).length;
    const onsight = count("onsight");
    const flash = count("flash");
    return [
      {
        type,
        onsight,
        flash,
        redpoint: count("redpoint"),
        repeat: yearSessions.filter(
          (session) => session.climbType === type && session.sent && !session.isAscent,
        ).length,
      },
    ];
  });
  return disciplines.length ? { disciplines } : null;
}

function buildPartner(yearSessions: readonly YearSessionRow[]): PartnerChapter | null {
  const partners = new Map<
    string,
    { partner: YearSessionRow["companions"][number]; days: Set<string> }
  >();
  for (const session of yearSessions) {
    for (const companion of session.companions) {
      const entry = partners.get(companion.id) ?? { partner: companion, days: new Set<string>() };
      entry.days.add(session.entryDate);
      partners.set(companion.id, entry);
    }
  }
  const best = [...partners.values()].toSorted(
    (a, b) => b.days.size - a.days.size || a.partner.name.localeCompare(b.partner.name),
  )[0];
  return best && best.days.size >= YEAR_THRESHOLDS.partnerDays
    ? { partner: best.partner, days: best.days.size }
    : null;
}

function buildGotAway(
  year: number,
  sends: readonly YearSendRow[],
  yearSessions: readonly YearSessionRow[],
  label: (type: ClimbType, grade: number) => string,
): GotAwayChapter | null {
  const yearEnd = `${year}-12-31`;
  const sent = new Set(
    sends.filter((send) => send.dateSent == null || send.dateSent <= yearEnd).map((s) => s.climbId),
  );
  const byClimb = new Map<number, YearSessionRow[]>();
  for (const session of yearSessions) {
    if (sent.has(session.climbId)) continue;
    byClimb.set(session.climbId, [...(byClimb.get(session.climbId) ?? []), session]);
  }
  const lastDate = (list: YearSessionRow[]) =>
    list
      .map((session) => session.entryDate)
      .toSorted(byDate)
      .at(-1) ?? "";
  // Most sessions first; a tie goes to the climb tried most recently.
  const climbs = [...byClimb.values()]
    .filter((list) => list.length >= YEAR_THRESHOLDS.gotAwaySessions)
    .toSorted(
      (a, b) =>
        b.length - a.length ||
        byDate(lastDate(b), lastDate(a)) ||
        a[0].climbName.localeCompare(b[0].climbName),
    )
    .slice(0, YEAR_THRESHOLDS.gotAwayLimit)
    .map((list) => ({
      climbId: list[0].climbId,
      climbName: list[0].climbName,
      label: label(list[0].climbType, list[0].climbGrade),
      sessions: list.length,
      first: list.map((session) => session.entryDate).toSorted(byDate)[0],
      last: lastDate(list),
    }));
  return climbs.length ? { climbs } : null;
}

function buildNotWorthThePump(
  yearSends: readonly Dated<YearSendRow>[],
  label: (type: ClimbType, grade: number) => string,
  areas: YearAreaMap,
): NotWorthThePumpChapter | null {
  const climbs = yearSends
    .filter((send) => send.rating != null && send.rating <= YEAR_THRESHOLDS.pumpMaxRating)
    .toSorted(
      (a, b) =>
        (a.rating ?? 0) - (b.rating ?? 0) ||
        byDate(a.dateSent, b.dateSent) ||
        a.climbName.localeCompare(b.climbName),
    )
    .slice(0, 3)
    .map((send) => {
      const rating = send.rating ?? 0;
      const others =
        send.ratingCount > 1 ? (send.ratingSum - rating) / (send.ratingCount - 1) : null;
      return {
        climbId: send.climbId,
        climbName: send.climbName,
        label: label(send.climbType, send.grade),
        rating,
        comment: send.comment,
        othersAverage: others != null && Math.abs(others - rating) >= 1 ? others : null,
        place: placeOf(areas, send.areaId),
      };
    });
  return climbs.length ? { climbs } : null;
}

function bestSendWindow(yearSends: readonly Dated<YearSendRow>[]): PersonaMetrics["bestWindow"] {
  const dates = yearSends.map((send) => send.dateSent).toSorted(byDate);
  if (!dates.length) return null;
  let best = { count: 0, start: 0, end: 0 };
  let end = 0;
  for (let start = 0; start < dates.length; start += 1) {
    const limit = shiftDate(dates[start], 59);
    while (end + 1 < dates.length && dates[end + 1] <= limit) end += 1;
    if (end - start + 1 > best.count) best = { count: end - start + 1, start, end };
  }
  return {
    share: best.count / dates.length,
    sends: best.count,
    from: monthName(monthOf(dates[best.start])),
    to: monthName(monthOf(dates[best.end])),
  };
}

/**
 * The climber's year, chapter by chapter, from their whole history. Pure: the
 * page, the shared link and the story images all render from this.
 */
// oxlint-disable-next-line max-lines-per-function, complexity -- assembles every chapter from one pass of shared indexes
export function buildYearInReview(input: YearReviewInput, prefs: GradePreferences): YearReview {
  const { year, areas, sends, sessions } = input;
  const label = (type: ClimbType, grade: number) => gradeArray(type, prefs)[grade] ?? "?";
  const prefix = `${year}-`;
  const datedSends = sends.filter(isDated);
  const yearSends = datedSends
    .filter((send) => send.dateSent.startsWith(prefix))
    .toSorted((a, b) => byDate(a.dateSent, b.dateSent));
  const yearSessions = sessions.filter((session) => session.entryDate.startsWith(prefix));
  const types = disciplineOrder(yearSends);

  // Every dated day with a session or a send, over all time (trips look
  // back), and the year's slice of it.
  const allDays = new Map<string, DayActivity>();
  const day = (date: string) => {
    const existing = allDays.get(date);
    if (existing) return existing;
    const created: DayActivity = { date, climbs: new Set(), areas: new Set(), sends: [] };
    allDays.set(date, created);
    return created;
  };
  for (const session of sessions) {
    const entry = day(session.entryDate);
    entry.climbs.add(session.climbId);
    entry.areas.add(session.areaId);
  }
  for (const send of datedSends) {
    const entry = day(send.dateSent);
    entry.climbs.add(send.climbId);
    entry.areas.add(send.areaId);
    entry.sends.push(send);
  }
  const yearDays = new Map(
    [...allDays.entries()]
      .filter(([date]) => date.startsWith(prefix))
      .toSorted(([a], [b]) => byDate(a, b)),
  );
  const dayList = [...yearDays.values()];
  const daysOut = dayList.length;
  const byMonth = Array.from({ length: 12 }, () => 0);
  for (const { date } of dayList) byMonth[monthOf(date) - 1] += 1;

  const hardest = rankings(yearSends, types, label, areas);
  const undated = yearSends.length ? 0 : sends.filter((send) => send.dateSent == null).length;
  const pyramids = types.map((type) => {
    const ofType = yearSends.filter((send) => send.climbType === type);
    const rows = buildPyramid(ofType.map(toAnalyticsRow), type, prefs);
    const marked =
      hardest.find((ranking) => ranking.type === type)?.rows.map((row) => row.label) ?? [];
    return { type, rows, marked: [...new Set(marked)] };
  });

  const stepsByType = new Map(
    CLIMB_TYPES.map((type) => [type, gradeSteps(sends, type, year, label, areas)] as const),
  );
  const allSteps = [...stepsByType.values()].flatMap((result) => result.steps);
  const newGradeDisciplines = CLIMB_TYPES.flatMap((type) => {
    const result = stepsByType.get(type);
    return result?.steps.length ? [{ type, steps: result.steps, firstYear: result.firstYear }] : [];
  });
  const newGrades: NewGradesChapter | null = newGradeDisciplines.length
    ? { disciplines: newGradeDisciplines }
    : null;

  const located = dayList.flatMap((entry) => {
    const { place } = locate(areas, entry.areas);
    return place ? [place.id] : [];
  });
  const sendsByArea = new Map<number, number>();
  for (const send of yearSends) {
    for (const id of areas.get(send.areaId)?.path ?? [])
      sendsByArea.set(id, (sendsByArea.get(id) ?? 0) + 1);
  }
  const home =
    located.length >= YEAR_THRESHOLDS.homeTurfDays ? homeArea(areas, located, sendsByArea) : null;
  const homePlace = home ? placeOf(areas, home.id) : null;
  const homeTurf: HomeTurfChapter | null =
    home && homePlace
      ? {
          place: homePlace,
          days: home.days,
          totalDays: located.length,
          sends: sendsByArea.get(home.id) ?? 0,
          spread: home.atRoot && home.children.length > 1,
          breakdown: home.children
            .slice(0, 3)
            .map((child) => ({ name: areas.get(child.id)?.name ?? "", days: child.days })),
        }
      : null;

  const newGround = buildNewGround(input, yearDays);
  const trips = buildTrips(input, yearDays, allDays, datedSends, allSteps, label);
  const flashRankings = rankings(
    yearSends.filter((send) => send.ascentStyle === "flash"),
    types,
    label,
    areas,
  );
  const onsightRankings = rankings(
    yearSends.filter((send) => send.ascentStyle === "onsight"),
    types.filter((type) => type !== "boulder"),
    label,
    areas,
  );
  const styles = buildStyles(yearSends, yearSessions, types);
  const partner = buildPartner(yearSessions);
  const gotAway = buildGotAway(year, sends, yearSessions, label);
  const notWorthThePump = buildNotWorthThePump(yearSends, label, areas);
  const calendar = buildCalendar(dayList, yearSends, types, label);
  const rampage = (type: ClimbType) => rampageFor(type, yearSessions, yearSends, label, areas);
  const boulderRampage = rampage("boulder");
  const sportRampage = rampage("sport");
  const tradRampage = rampage("trad");

  // Personas.
  let personas: YearChapters["personas"] = null;
  if (daysOut >= YEAR_THRESHOLDS.personaDays) {
    const limitCutoff = new Map(
      hardest.map((ranking) => [ranking.type, Math.min(...ranking.rows.map((row) => row.grade))]),
    );
    const sieges = yearSends
      .filter((send) => send.grade >= (limitCutoff.get(send.climbType) ?? Infinity))
      .map((send) => ({
        climbName: send.climbName,
        sessions: sessions.filter(
          (session) => session.climbId === send.climbId && session.entryDate <= send.dateSent,
        ).length,
      }));
    for (const climb of gotAway?.climbs ?? [])
      sieges.push({ climbName: climb.climbName, sessions: climb.sessions });
    const siege = sieges.toSorted((a, b) => b.sessions - a.sessions)[0] ?? null;
    const pyramidPick = pyramids
      .filter((entry) => entry.rows.length >= 4)
      .map((entry) => ({
        entry,
        sends: entry.rows.reduce((total, row) => total + row.count, 0),
      }))
      .filter(({ sends: count }) => count >= 25)
      .toSorted((a, b) => b.sends - a.sends)[0];
    const pyramidRows = pyramidPick?.entry.rows ?? [];
    const pairs = pyramidRows
      .slice(0, -1)
      .map((row, index) => pyramidRows[index + 1].count >= row.count);
    const metrics: PersonaMetrics = {
      sends: yearSends.length,
      daysOut,
      firstTryRate: yearSends.length
        ? yearSends.filter((send) => send.ascentStyle !== "redpoint").length / yearSends.length
        : 0,
      siege,
      locatedDays: located.length,
      homeShare: homeShareOf(homeTurf, located.length),
      homeName: homePlace?.name ?? null,
      tripLocations: new Set(
        trips?.trips.flatMap((card) => (card.location ? [card.location.id] : [])) ?? [],
      ).size,
      newClimbs: newGround.newClimbs,
      pyramid: pyramidPick
        ? {
            tiers: pyramidRows.length,
            top: pyramidRows[0].count,
            base: pyramidRows.at(-1)?.count ?? 0,
            shape: pairs.length ? pairs.filter(Boolean).length / pairs.length : 0,
            counts: pyramidRows.map((row) => row.count),
            from: pyramidRows.at(-1)?.label ?? "",
            to: pyramidRows[0].label,
            sends: pyramidPick.sends,
          }
        : null,
      repeats: yearSessions.filter((session) => session.sent && !session.isAscent).length,
      bestWindow: bestSendWindow(yearSends),
      disciplineShares: types.map((type) => ({
        type,
        share:
          yearSends.filter((send) => send.climbType === type).length /
          Math.max(yearSends.length, 1),
      })),
    };
    personas = { personas: rankPersonas(metrics) };
  }

  const chapters: YearChapters = {
    intro: {
      daysOut,
      sends: yearSends.length,
      areasVisited: new Set(dayList.flatMap((entry) => [...entry.areas])).size,
      disciplines: types,
    },
    days: { daysOut, byMonth },
    hardest: { disciplines: hardest, undated },
    pyramids: { disciplines: pyramids, undated },
    calendar,
    boulderRampage,
    sportRampage,
    tradRampage,
    homeTurf,
    newGround: newGround.chapter,
    trips,
    newGrades,
    flashes: flashRankings.length ? { disciplines: flashRankings } : null,
    onsights: onsightRankings.length ? { disciplines: onsightRankings } : null,
    styles,
    partner,
    gotAway,
    notWorthThePump,
    personas,
  };

  return {
    year,
    active: daysOut > 0 || yearSends.length > 0,
    chapters,
    missed: missedChapters(chapters, { year, yearSends, stepsByType }),
  };
}

/** The share of located days at the one busiest place. When the days are
 * spread across a root, that's its busiest child, not the root itself. */
function homeShareOf(homeTurf: HomeTurfChapter | null, locatedDays: number): number {
  if (!homeTurf || locatedDays === 0) return 1;
  const days = homeTurf.spread
    ? Math.max(0, ...homeTurf.breakdown.map((entry) => entry.days))
    : homeTurf.days;
  return days / locatedDays;
}

function toAnalyticsRow(send: Dated<YearSendRow>): AnalyticsSendRow {
  return {
    climbId: send.climbId,
    climbName: send.climbName,
    climbType: send.climbType,
    suggestedGrade: send.grade,
    areaId: send.areaId,
    areaName: "",
    ascentStyle: send.ascentStyle,
    dateSent: send.dateSent,
  };
}

// oxlint-disable-next-line complexity -- one flat hint per optional chapter
function missedChapters(
  chapters: YearChapters,
  context: {
    year: number;
    yearSends: readonly Dated<YearSendRow>[];
    stepsByType: ReadonlyMap<ClimbType, ReturnType<typeof gradeSteps>>;
  },
): MissedChapter[] {
  const { year, yearSends } = context;
  const missed: MissedChapter[] = [];
  const add = (id: MissedChapter["id"], hint: string, positive = false) =>
    missed.push({ id, hint, ...(positive ? { positive } : {}) });

  if (!chapters.calendar)
    add("calendar", "Log 6+ days to see your peak month and when you send hardest.");
  if (!chapters.boulderRampage && chapters.intro.disciplines.includes("boulder"))
    add("boulder-rampage", "Send 4+ problems (repeats count) in one day for a boulder rampage.");
  if (!chapters.sportRampage && chapters.intro.disciplines.includes("sport"))
    add("sport-rampage", "Send 4+ sport routes (repeats count) in one day for a sport rampage.");
  if (!chapters.tradRampage && chapters.intro.disciplines.includes("trad"))
    add("trad-rampage", "Send 4+ trad routes (repeats count) in one day for a trad rampage.");
  if (!chapters.homeTurf) add("home-turf", "Log 3+ sessions to find your home crag.");
  if (!chapters.newGround)
    add(
      "new-ground",
      `Every place you climbed in ${year} was one you'd been before. Try somewhere new next year.`,
    );
  if (!chapters.trips)
    add(
      "trips",
      "Add a trip in Betabook (just a name and dates) and next year's review will celebrate it.",
    );
  if (!chapters.newGrades) {
    const main = chapters.intro.disciplines[0] ?? "boulder";
    const ceiling = context.stepsByType.get(main)?.ceiling;
    add(
      "new-grades",
      ceiling
        ? `No new grade in ${year}. Your hardest ${DISCIPLINE_NAMES[main]} is still ${ceiling.label}. Pick a harder project for next year.`
        : `Log your sends to track new grades next year.`,
    );
  }
  if (!chapters.flashes)
    add(
      "flashes",
      `No flashes in ${year}. Log the style on your sends so first-try ascents count.`,
    );
  if (!chapters.onsights && chapters.intro.disciplines.some((type) => type !== "boulder"))
    add(
      "onsights",
      `No onsights in ${year}. Try a route you've never seen, and log it as an onsight.`,
    );
  if (!chapters.styles)
    add("styles", "Log 5+ sends with their style to unlock your send breakdown.");
  if (!chapters.partner) add("partner", "Tag friends on your journal sessions to find your crew.");
  if (!chapters.gotAway)
    add("got-away", "No unfinished projects. You sent everything you tried twice.", true);
  if (!chapters.notWorthThePump) {
    const rated = yearSends.filter((send) => send.rating != null).length;
    if (rated >= YEAR_THRESHOLDS.pumpRatedForPraise)
      add("not-worth-the-pump", "Nothing rated below 3★. Every send was a keeper.", true);
    else add("not-worth-the-pump", "Rate your sends (1–5★) to find the ones not worth the pump.");
  }
  if (!chapters.personas) add("personas", `Log 6+ days to earn your ${year} personas.`);
  return missed;
}
