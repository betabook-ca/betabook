import type {
  AreaWithAncestorPath,
  ClimberRow,
  ClimbWithAreaName,
  SuggestedClimberRow,
} from "@/db/queries";
import type { AreaSelection } from "@/lib/area-selection";
import type { ClimbListPage } from "@/lib/climb-list-pages";
import { DEFAULT_CLIMB_LIST_SORT, parseClimbListSort } from "@/lib/climb-list-sort";
import {
  climbFilterToSearchParams,
  DEFAULT_CLIMB_FILTER,
  parseClimbFilter,
} from "@/lib/filters/climb-filter";
import type { ClimbFilterState } from "@/lib/filters/climb-filter-state";
import { formatCount } from "@/lib/format";
import type { ClimbType } from "@/lib/grades";
import type { PublicClimbsPage } from "@/lib/public-catalog";
import { areaHref, climbHref } from "@/lib/slug";
import { toArray, type UrlParamsRecord } from "@/lib/url-params";

export type SearchKind = "climb" | "area" | "climber";
export type SearchCategory = "all" | SearchKind;
export type SearchStatus = "idle" | "loading" | "ready" | "error" | "locked";
export type SearchResult = {
  id: string;
  name: string;
  detail: string;
  disabledReason?: string;
  image?: string | null;
} & (
  | {
      kind: "climb";
      discipline: ClimbType;
      grade: number | null;
      stats?: { avgRating: number | null; sendCount: number };
    }
  | { kind: "area" | "climber" }
);
export type SearchSection = {
  kind: SearchKind;
  label?: string;
  items: SearchResult[];
  status: SearchStatus;
  hasMore?: boolean;
};
export type ClimbSelectionContext = {
  ancestors: { id: number; name: string }[];
  sendCount: number;
  sent: boolean;
};
export type AppSearchResult = SearchResult & {
  href: string;
  climb?: ClimbWithAreaName;
  context?: ClimbSelectionContext;
  climber?: ClimberRow;
};
export type SearchPage = { items: AppSearchResult[]; hasMore: boolean; nextPage: number };
export type SearchState = ClimbFilterState & {
  query: string;
  category: SearchCategory;
};
export type SearchSnapshot = { kind: SearchKind; page: SearchPage; status: SearchStatus }[];
export type SearchFetcher = (
  state: SearchState,
  kind: SearchKind,
  page: number,
  signal: AbortSignal,
) => Promise<SearchPage>;
export const SEARCH_KINDS: SearchKind[] = ["climb", "area", "climber"];
export const EMPTY_SEARCH: SearchState = {
  query: "",
  category: "all",
  filter: DEFAULT_CLIMB_FILTER,
  sort: DEFAULT_CLIMB_LIST_SORT,
  area: null,
};

export function parseSearchState(
  params: UrlParamsRecord,
  area: AreaSelection | null = null,
): SearchState {
  const raw = toArray(params.mode)[0];
  const category = raw === "climb" || raw === "area" || raw === "climber" ? raw : "all";
  return {
    query: toArray(params.name)[0] ?? "",
    category,
    filter: parseClimbFilter(params),
    sort: parseClimbListSort(params),
    area,
  };
}

/** The public endpoints' spelling of a search. An area list has no climb
 * columns, so only the name scope and a name ordering reach it. */
export function publicSearchParams(state: SearchState, kind: SearchKind): URLSearchParams {
  if (kind !== "area")
    return climbFilterToSearchParams(state.sort, { ...state.filter, name: state.query });
  const params = new URLSearchParams({
    name: state.query,
    sort: state.sort === "name_desc" ? "name_desc" : "name_asc",
  });
  if (state.filter.areaId !== undefined) params.set("areaId", String(state.filter.areaId));
  if (state.filter.areaName) params.set("areaName", state.filter.areaName);
  return params;
}

/** Used by quick-search expansion, full results, and browser history. */
export function searchHref(state: SearchState): string {
  const params = climbFilterToSearchParams(state.sort, {
    ...state.filter,
    name: state.query,
  });
  params.set("mode", state.category);
  return `/?${params}`;
}

/** The row every climb result shares. A signed-out page stops here; a member
 * page adds the record and the viewer's own send state on top. */
function climbSearchItem(
  climb: Pick<ClimbWithAreaName, "id" | "name" | "areaName" | "type" | "grade">,
  ancestors: { id: number; name: string }[],
  stats: { avgRating: number | null; sendCount: number },
): AppSearchResult {
  return {
    id: `climb-${climb.id}`,
    kind: "climb",
    name: climb.name,
    detail: [...ancestors.map((area) => area.name), climb.areaName].join(" / "),
    discipline: climb.type,
    grade: climb.grade,
    stats,
    href: climbHref(climb.id, climb.name),
  };
}

export function climbSearchItems(page: ClimbListPage): AppSearchResult[] {
  return page.climbs.map((climb) => {
    const ancestors = page.areaBreadcrumbs[climb.areaId] ?? [];
    const sendCount = page.sendStats[climb.id]?.sendCount ?? 0;
    return {
      ...climbSearchItem(climb, ancestors, {
        avgRating: page.sendStats[climb.id]?.avgRating ?? null,
        sendCount,
      }),
      climb,
      context: { ancestors, sendCount, sent: page.sentClimbIds?.includes(climb.id) ?? false },
    };
  });
}
export function areaSearchItems(
  areas: Pick<AreaWithAncestorPath, "id" | "name" | "ancestorPath">[],
): AppSearchResult[] {
  return areas.map((area) => ({
    id: `area-${area.id}`,
    kind: "area",
    name: area.name,
    detail: area.ancestorPath?.split(" > ").join(" / ") ?? "Area",
    href: areaHref(area.id, area.name),
  }));
}
export function climberSearchItems(climbers: ClimberRow[]): AppSearchResult[] {
  return climbers.map((climber) => ({
    id: `climber-${climber.id}`,
    kind: "climber",
    name: climber.name,
    detail: "Climber",
    image: climber.image,
    href: `/users/${encodeURIComponent(climber.id)}`,
    climber,
  }));
}
export function showsClimberSuggestions(
  state: SearchState,
  viewerId: string | null,
): viewerId is string {
  return viewerId !== null && state.category === "climber" && !state.query.trim();
}

export function climberSuggestionItems(climbers: SuggestedClimberRow[]): AppSearchResult[] {
  return climberSearchItems(climbers).map((item, index) => ({
    ...item,
    detail: formatCount(climbers[index].mutualFriendCount, "mutual friend"),
  }));
}

export function publicClimbSearchItems(page: PublicClimbsPage): AppSearchResult[] {
  return page.climbs.map((climb) =>
    climbSearchItem(climb, page.areaBreadcrumbs[climb.areaId] ?? [], {
      avgRating: climb.avgRating,
      sendCount: climb.sendCount,
    }),
  );
}
