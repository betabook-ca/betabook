import type { ClimbStatsFilter, DisciplineGradeFilter, SubtreeClimbsSort } from "@/db/queries";
import { DEFAULT_CLIMB_LIST_SORT, parseClimbListSort } from "@/lib/climb-list-sort";
import {
  DEFAULT_MIN_ASCENTS,
  DEFAULT_RATING_RANGE,
  parseRatingRange,
} from "@/lib/filters/climb-stats-filter";
import {
  DEFAULT_DISCIPLINE_FILTER,
  appendDisciplineFilterParams,
  parseDisciplineFilter,
  toDisciplineGradeFilter,
  type DisciplineFilter,
} from "@/lib/filters/discipline-filter";
import { toArray, type UrlParamsRecord } from "@/lib/url-params";

export const DEFAULT_AREA_CLIMBS_SORT = DEFAULT_CLIMB_LIST_SORT;

/** Ranges are always present (unlike DisciplineGradeFilter's, which are
 * optional) — a range slider needs a default position to render even for an
 * unchecked discipline. Only when this is handed to the query layer
 * (toSubtreeQueryFilter) does an unchecked discipline's range get dropped. */
export type AreaClimbsFilter = DisciplineFilter & {
  name?: string;
  ratingRange: [number, number];
  minAscents: number;
  /** Scope the list to one sub-area's subtree (the sub-area rail's filter).
   * `null` = the whole area. Validated server-side against the page's area
   * before it targets a query. */
  subareaId: number | null;
};

export const DEFAULT_AREA_CLIMBS_FILTER: AreaClimbsFilter = {
  ...DEFAULT_DISCIPLINE_FILTER,
  ratingRange: DEFAULT_RATING_RANGE,
  minAscents: DEFAULT_MIN_ASCENTS,
  subareaId: null,
};

export const parseAreaClimbsSort = parseClimbListSort;

export function parseAreaClimbsFilter(params: UrlParamsRecord): AreaClimbsFilter {
  const minAscents = Number(toArray(params.minAscents)[0]);
  const subarea = Number(toArray(params.subarea)[0]);

  return {
    ...parseDisciplineFilter(params),
    name: toArray(params.name)[0],
    ratingRange: parseRatingRange(params.ratingRange),
    minAscents: Number.isFinite(minAscents) && minAscents >= 0 ? minAscents : DEFAULT_MIN_ASCENTS,
    subareaId: Number.isInteger(subarea) && subarea > 0 ? subarea : null,
  };
}

/** getSubtreeClimbs's filter param — same "only pass a range for a checked
 * discipline" convention as the climb search page, so an unchecked
 * discipline's (possibly stale, from before it was unchecked) range can't
 * smuggle in a filter. Rating range/min ascents are passed through as-is —
 * they're not discipline-scoped, so "no filter" is just their own default. */
export function toSubtreeQueryFilter(
  filter: AreaClimbsFilter,
): DisciplineGradeFilter & ClimbStatsFilter & { name?: string } {
  return {
    ...toDisciplineGradeFilter(filter),
    name: filter.name || undefined,
    ratingRange: filter.ratingRange,
    minAscents: filter.minAscents,
  };
}

/** Serializes both the sort and the discipline/grade filter into one query
 * string — shared by the sort control, the filter panel, and the "load
 * more" fetch, so all three build the exact same param shape
 * parseAreaClimbsSort/parseAreaClimbsFilter expect back. */
export function areaClimbsFilterToSearchParams(
  sort: SubtreeClimbsSort,
  filter: AreaClimbsFilter,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("sort", sort);
  if (filter.name) params.set("name", filter.name);
  if (filter.subareaId != null) params.set("subarea", String(filter.subareaId));
  appendDisciplineFilterParams(params, filter);
  params.append("ratingRange", String(filter.ratingRange[0]));
  params.append("ratingRange", String(filter.ratingRange[1]));
  if (filter.minAscents) params.set("minAscents", String(filter.minAscents));
  return params;
}
