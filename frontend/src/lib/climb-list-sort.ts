import { toArray, type UrlParamsRecord } from "@/lib/url-params";

const CLIMB_LIST_SORTS = [
  "name_asc",
  "name_desc",
  "grade_asc",
  "grade_desc",
  "rating_asc",
  "rating_desc",
  "ascents_asc",
  "ascents_desc",
] as const;

export type SubtreeClimbsSort = (typeof CLIMB_LIST_SORTS)[number];

export const DEFAULT_CLIMB_LIST_SORT: SubtreeClimbsSort = "ascents_desc";

export function parseClimbListSort(params: UrlParamsRecord): SubtreeClimbsSort {
  const rawSort = toArray(params.sort)[0];
  return CLIMB_LIST_SORTS.find((sort) => sort === rawSort) ?? DEFAULT_CLIMB_LIST_SORT;
}
