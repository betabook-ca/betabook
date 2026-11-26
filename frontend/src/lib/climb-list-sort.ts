import type { SubtreeClimbsSort } from "@/db/queries";
import { toArray, type UrlParamsRecord } from "@/lib/url-params";

// Must match SUBTREE_CLIMBS_ORDER_BY in db/queries/climbs.ts.
const CLIMB_LIST_SORTS = new Set<SubtreeClimbsSort>([
  "name_asc",
  "name_desc",
  "grade_asc",
  "grade_desc",
  "rating_asc",
  "rating_desc",
  "ascents_asc",
  "ascents_desc",
]);

export const DEFAULT_CLIMB_LIST_SORT: SubtreeClimbsSort = "ascents_desc";

export function parseClimbListSort(params: UrlParamsRecord): SubtreeClimbsSort {
  const rawSort = toArray(params.sort)[0];
  return CLIMB_LIST_SORTS.has(rawSort as SubtreeClimbsSort)
    ? (rawSort as SubtreeClimbsSort)
    : DEFAULT_CLIMB_LIST_SORT;
}
