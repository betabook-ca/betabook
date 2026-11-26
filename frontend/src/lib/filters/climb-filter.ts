import type { SearchClimbsParams, SubtreeClimbsSort } from "@/db/queries";
import {
  DEFAULT_MIN_ASCENTS,
  DEFAULT_RATING_RANGE,
  excludeSentBy,
  parseExcludeSent,
  parseRatingRange,
} from "@/lib/filters/climb-stats-filter";
import {
  DEFAULT_DISCIPLINE_FILTER,
  appendDisciplineFilterParams,
  parseDisciplineFilter,
  toDisciplineGradeFilter,
  type DisciplineFilter,
} from "@/lib/filters/discipline-filter";
import { parseAreaId, toArray, type UrlParamsRecord } from "@/lib/url-params";

export type ClimbFilter = DisciplineFilter & {
  name?: string;
  areaName?: string;
  areaId?: number;
  ratingRange: [number, number];
  minAscents: number;
  /** Hide climbs the signed-in reader has sent. */
  excludeSent: boolean;
};

export const DEFAULT_CLIMB_FILTER: ClimbFilter = {
  ...DEFAULT_DISCIPLINE_FILTER,
  ratingRange: DEFAULT_RATING_RANGE,
  minAscents: DEFAULT_MIN_ASCENTS,
  excludeSent: false,
};

export function parseClimbFilter(params: UrlParamsRecord): ClimbFilter {
  const minAscents = Number(toArray(params.minAscents)[0]);

  return {
    ...parseDisciplineFilter(params),
    name: toArray(params.name)[0],
    areaName: toArray(params.areaName)[0],
    areaId: parseAreaId(toArray(params.areaId)[0]),
    ratingRange: parseRatingRange(params.ratingRange),
    minAscents: Number.isFinite(minAscents) && minAscents >= 0 ? minAscents : DEFAULT_MIN_ASCENTS,
    excludeSent: parseExcludeSent(params.excludeSent),
  };
}

/** Every refinement except sort, in the shape `parseClimbFilter` reads back.
 * Shared by search and saved lists, which have their own sorts. */
export function appendClimbFilterParams(params: URLSearchParams, filter: ClimbFilter): void {
  if (filter.name) params.set("name", filter.name);
  if (filter.areaName) params.set("areaName", filter.areaName);
  if (filter.areaId !== undefined) params.set("areaId", String(filter.areaId));
  appendDisciplineFilterParams(params, filter);
  params.append("ratingRange", String(filter.ratingRange[0]));
  params.append("ratingRange", String(filter.ratingRange[1]));
  if (filter.minAscents) params.set("minAscents", String(filter.minAscents));
  if (filter.excludeSent) params.set("excludeSent", "1");
}

/** Serializes climb-list refinements. The search controller owns the category. */
export function climbFilterToSearchParams(
  sort: SubtreeClimbsSort,
  filter: ClimbFilter,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("sort", sort);
  appendClimbFilterParams(params, filter);
  return params;
}

/** searchClimbs's query param — same "drop a range for an unchecked
 * discipline" convention as toSubtreeQueryFilter. `viewerId` is whose sends
 * Exclude sent hides; without one the filter does nothing. */
export function toClimbQueryParams(
  filter: ClimbFilter,
  sort: SubtreeClimbsSort | undefined,
  viewerId?: string | null,
): SearchClimbsParams {
  return {
    ...toDisciplineGradeFilter(filter),
    name: filter.name || undefined,
    areaName: filter.areaName || undefined,
    areaId: filter.areaId,
    ratingRange: filter.ratingRange,
    minAscents: filter.minAscents,
    excludeSentBy: excludeSentBy(filter.excludeSent, viewerId),
    sort,
  };
}
