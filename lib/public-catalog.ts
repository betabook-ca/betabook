import type { AreaBreadcrumbs } from "@/db/queries/areas";
import type { SubtreeClimbsSort } from "@/db/queries/climbs";
import { parseClimbListSort } from "@/lib/climb-list-sort";
import { parseRatingRange } from "@/lib/filters/climb-stats-filter";
import {
  parseDisciplineFilter,
  toDisciplineGradeFilter,
  type DisciplineGradeFilter,
} from "@/lib/filters/discipline-filter";
import type { ClimbType } from "@/lib/grades";
import type { AscentStyle, GradeFeel } from "@/lib/sends";
import {
  parseAreaId,
  parseOffset,
  parsePage,
  parseSuggestionLimit,
  offsetReachesPaginationLimit,
  searchParamsToRecord,
} from "@/lib/url-params";

export type PublicArea = { id: number; name: string; parentId: number | null };
export type PublicAreaDetails = PublicArea & { description: string | null };
export type PublicAreaResult = PublicAreaDetails & { ancestorPath: string | null };
export type PublicClimb = {
  id: number;
  name: string;
  areaId: number;
  areaName: string;
  type: ClimbType;
  grade: number | null;
  description: string | null;
  /** Whole-catalog aggregates over logged sends. They name no one, so they
   * are readable without a session; the sends behind them are not. */
  avgRating: number | null;
  sendCount: number;
};
/** `userName` and `comment` stay null unless the climber shares commentary
 * with Everyone from a public profile; anonymous rows carry only a "YYYY-MM" month. */
export type PublicClimbSend = {
  userName: string | null;
  dateSent: string | null;
  ascentStyle: AscentStyle;
  rating: number | null;
  suggestedGrade: number | null;
  gradeFeel: GradeFeel;
  comment: string | null;
};
export type PublicClimbsPage = {
  climbs: PublicClimb[];
  areaBreadcrumbs: AreaBreadcrumbs;
  hasNextPage: boolean;
};
/** A climb list orders on every field the member list does; an area list has only its name. */
const PUBLIC_AREA_SORTS = ["name_asc", "name_desc"] as const;

export type PublicCatalogOptions = DisciplineGradeFilter & {
  name: string;
  areaId?: number;
  areaName?: string;
  sort: SubtreeClimbsSort;
  ratingRange: [number, number];
  minAscents: number;
  offset: number | null;
  pageSize: number;
};

const PUBLIC_PARAMS = new Set([
  "name",
  "areaId",
  "areaName",
  "subarea",
  "page",
  "offset",
  "limit",
  "sort",
]);

/** Narrowing on a climb fact the projection already returns discloses nothing
 * new. An area list has none of these columns, so the same params there would
 * be dropped in silence and stay protected. */
const PUBLIC_CLIMB_PARAMS = new Set([
  "discipline",
  "boulderRange",
  "sportRange",
  "tradRange",
  "ratingRange",
  "minAscents",
]);

export function hasProtectedCatalogParams(
  params: URLSearchParams,
  { climbFilters = false }: { climbFilters?: boolean } = {},
): boolean {
  const sort = params.get("sort");
  return (
    [...params.keys()].some(
      (key) => !PUBLIC_PARAMS.has(key) && !(climbFilters && PUBLIC_CLIMB_PARAMS.has(key)),
    ) ||
    // A climb list accepts any climb-list ordering; an area list only its name.
    (sort !== null &&
      (climbFilters
        ? parseClimbListSort({ sort }) !== sort
        : !(PUBLIC_AREA_SORTS as readonly string[]).includes(sort)))
  );
}

export function publicCatalogOptions(params: URLSearchParams): PublicCatalogOptions {
  const pageSize = parseSuggestionLimit(params) ?? 25;
  const page = parsePage(params, pageSize);
  return {
    ...toDisciplineGradeFilter(parseDisciplineFilter(searchParamsToRecord(params))),
    name: params.get("name") ?? "",
    areaId: parseAreaId(params.get("areaId") ?? undefined),
    areaName: params.get("areaName") ?? undefined,
    sort: parseClimbListSort({ sort: params.get("sort") ?? undefined }),
    ratingRange: parseRatingRange(params.getAll("ratingRange")),
    minAscents: Math.max(0, Math.trunc(Number(params.get("minAscents"))) || 0),
    offset: params.has("offset")
      ? parseOffset(params)
      : page === null
        ? null
        : (page - 1) * pageSize,
    pageSize,
  };
}

export function publicHasNextPage(length: number, options: PublicCatalogOptions): boolean {
  return (
    length > options.pageSize &&
    options.offset !== null &&
    !offsetReachesPaginationLimit(options.offset, options.pageSize)
  );
}
