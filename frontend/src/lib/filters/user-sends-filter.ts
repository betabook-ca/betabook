import { MAX_RATING } from "@/lib/filters/climb-stats-filter";
import {
  appendDateFilterParams,
  parseDateFilter,
  type DateFilterValue,
} from "@/lib/filters/date-filter";
import {
  DEFAULT_DISCIPLINE_FILTER,
  appendDisciplineFilterParams,
  parseDisciplineFilter,
  type DisciplineFilter,
} from "@/lib/filters/discipline-filter";
import { normalizeHashtagFilters } from "@/lib/filters/hashtag-filter";
import type { AscentStyle } from "@/lib/sends";
import { parseAreaId, parseAscentStyles, toArray, type UrlParamsRecord } from "@/lib/url-params";

const USER_SENDS_SORTS = [
  "date_desc",
  "date_asc",
  "grade_desc",
  "grade_asc",
  "rating_desc",
  "rating_asc",
] as const;
export type UserSendsSort = (typeof USER_SENDS_SORTS)[number];
export type UserSendsFilter = DisciplineFilter &
  DateFilterValue & {
    tags?: string[];
    name?: string;
    areaName?: string;
    areaId?: number;
    sort?: UserSendsSort;
    ascentStyles: AscentStyle[];
    minRating: number;
    maxRating: number;
  };

export const DEFAULT_USER_SENDS_SORT: UserSendsSort = "date_desc";

/** An empty list or a zero rating turns that filter off rather than matching nothing. */
export const DEFAULT_USER_SENDS_FILTER: UserSendsFilter = {
  ...DEFAULT_DISCIPLINE_FILTER,
  sort: DEFAULT_USER_SENDS_SORT,
  tags: [],
  ascentStyles: [],
  minRating: 0,
  maxRating: 0,
};

export function parseUserSendsFilter(params: UrlParamsRecord): UserSendsFilter {
  const rawSort = toArray(params.sort)[0];
  const sort = USER_SENDS_SORTS.find((sort) => sort === rawSort) ?? DEFAULT_USER_SENDS_SORT;

  const maxRating = Number(toArray(params.maxRating)[0]);
  const minRating = Number(toArray(params.minRating)[0]);

  return {
    ...parseDateFilter(params),
    ...parseDisciplineFilter(params),
    tags: normalizeHashtagFilters(toArray(params.tag)),
    name: toArray(params.name)[0],
    areaName: toArray(params.areaName)[0],
    areaId: parseAreaId(toArray(params.areaId)[0]),
    sort,
    ascentStyles: parseAscentStyles(params),
    maxRating:
      Number.isInteger(maxRating) && maxRating >= 0 && maxRating <= MAX_RATING ? maxRating : 0,
    minRating:
      Number.isInteger(minRating) && minRating >= 0 && minRating <= MAX_RATING
        ? minRating
        : DEFAULT_USER_SENDS_FILTER.minRating,
  };
}

export function userSendsFilterToSearchParams(filter: UserSendsFilter): URLSearchParams {
  const params = new URLSearchParams();
  for (const tag of normalizeHashtagFilters(filter.tags ?? [])) params.append("tag", tag);
  appendDateFilterParams(params, filter);
  appendDisciplineFilterParams(params, filter);
  if (filter.name) params.set("name", filter.name);
  if (filter.areaName) params.set("areaName", filter.areaName);
  if (filter.areaId !== undefined) params.set("areaId", String(filter.areaId));
  params.set("sort", filter.sort ?? DEFAULT_USER_SENDS_SORT);
  for (const style of filter.ascentStyles) {
    params.append("ascentStyle", style);
  }
  if (filter.minRating) params.set("minRating", String(filter.minRating));
  if (filter.maxRating) params.set("maxRating", String(filter.maxRating));
  return params;
}
