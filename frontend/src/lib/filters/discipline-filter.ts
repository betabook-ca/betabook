import { BOULDER_HUECO, ROPE_YDS, type Discipline } from "@/lib/grades";
import { parseDisciplines, toRange, type UrlParamsRecord } from "@/lib/url-params";

export type DisciplineGradeFilter = {
  disciplines: Discipline[];
  boulderRange?: [number, number];
  sportRange?: [number, number];
  tradRange?: [number, number];
};

export const DEFAULT_BOULDER_RANGE: [number, number] = [0, BOULDER_HUECO.length - 1];
export const DEFAULT_SPORT_RANGE: [number, number] = [0, ROPE_YDS.length - 1];
export const DEFAULT_TRAD_RANGE: [number, number] = [0, ROPE_YDS.length - 1];

/** The discipline-checkbox + per-discipline grade-range slice shared by
 * every filter in the app (climb search, area climbs, user sends) — ranges
 * are always present (unlike DisciplineGradeFilter's optional ones) since a
 * range dropdown needs a default position even for an unchecked discipline. */
export type DisciplineFilter = {
  disciplines: Discipline[];
  boulderRange: [number, number];
  sportRange: [number, number];
  tradRange: [number, number];
};

export const DEFAULT_DISCIPLINE_FILTER: DisciplineFilter = {
  disciplines: [],
  boulderRange: DEFAULT_BOULDER_RANGE,
  sportRange: DEFAULT_SPORT_RANGE,
  tradRange: DEFAULT_TRAD_RANGE,
};

export function parseDisciplineFilter(params: UrlParamsRecord): DisciplineFilter {
  return {
    disciplines: parseDisciplines(params),
    boulderRange: toRange(params.boulderRange, DEFAULT_BOULDER_RANGE),
    sportRange: toRange(params.sportRange, DEFAULT_SPORT_RANGE),
    tradRange: toRange(params.tradRange, DEFAULT_TRAD_RANGE),
  };
}

export function appendDisciplineFilterParams(
  params: URLSearchParams,
  filter: DisciplineFilter,
): void {
  for (const discipline of filter.disciplines) {
    params.append("discipline", discipline);
  }
  if (filter.disciplines.includes("boulder")) {
    params.append("boulderRange", String(filter.boulderRange[0]));
    params.append("boulderRange", String(filter.boulderRange[1]));
  }
  if (filter.disciplines.includes("sport")) {
    params.append("sportRange", String(filter.sportRange[0]));
    params.append("sportRange", String(filter.sportRange[1]));
  }
  if (filter.disciplines.includes("trad")) {
    params.append("tradRange", String(filter.tradRange[0]));
    params.append("tradRange", String(filter.tradRange[1]));
  }
}

/** Drops a range when its discipline isn't checked, so a stale range (left
 * over from before the discipline was unchecked) can't smuggle in a
 * filter — the shape the query layer (DisciplineGradeFilter) expects. */
export function toDisciplineGradeFilter(filter: DisciplineFilter): DisciplineGradeFilter {
  return {
    disciplines: filter.disciplines,
    boulderRange: filter.disciplines.includes("boulder") ? filter.boulderRange : undefined,
    sportRange: filter.disciplines.includes("sport") ? filter.sportRange : undefined,
    tradRange: filter.disciplines.includes("trad") ? filter.tradRange : undefined,
  };
}
