import type { SubtreeClimbsSort } from "@/lib/climb-list-sort";
import { DEFAULT_CLIMB_LIST_SORT, parseClimbListSort } from "@/lib/climb-list-sort";
import {
  DEFAULT_MIN_ASCENTS,
  DEFAULT_RATING_RANGE,
  parseExcludeSent,
  parseRatingRange,
} from "@/lib/filters/climb-stats-filter";
import {
  DEFAULT_DISCIPLINE_FILTER,
  appendDisciplineFilterParams,
  parseDisciplineFilter,
  type DisciplineFilter,
} from "@/lib/filters/discipline-filter";
import { toArray, type UrlParamsRecord } from "@/lib/url-params";

export const DEFAULT_AREA_CLIMBS_SORT = DEFAULT_CLIMB_LIST_SORT;

/** Range controls retain the selected bounds for each discipline. */
export type AreaClimbsFilter = DisciplineFilter & {
  name?: string;
  ratingRange: [number, number];
  minAscents: number;
  /** Scope the list to one sub-area's subtree (the sub-area rail's filter).
   * `null` = the whole area. Validated server-side against the page's area
   * before it targets a query. */
  subareaId: number | null;
  /** Hide climbs the signed-in reader has sent. */
  excludeSent: boolean;
};

export const DEFAULT_AREA_CLIMBS_FILTER: AreaClimbsFilter = {
  ...DEFAULT_DISCIPLINE_FILTER,
  ratingRange: DEFAULT_RATING_RANGE,
  minAscents: DEFAULT_MIN_ASCENTS,
  subareaId: null,
  excludeSent: false,
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
    excludeSent: parseExcludeSent(params.excludeSent),
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
  if (filter.excludeSent) params.set("excludeSent", "1");
  return params;
}
