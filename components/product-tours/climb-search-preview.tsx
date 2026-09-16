"use client";

import { useState } from "react";

import { SearchController } from "@/components/search/search-controller";
import type { LookupFetcher } from "@/hooks/use-search-lookup";
import { withClimbFilterArea } from "@/lib/filters/climb-filter-state";
import { MAX_RATING } from "@/lib/filters/climb-stats-filter";
import {
  DEFAULT_BOULDER_RANGE,
  DEFAULT_SPORT_RANGE,
  DEFAULT_TRAD_RANGE,
} from "@/lib/filters/discipline-filter";
import { TOUR_DEMO_AREA, TOUR_DEMO_CLIMBS, type TourDemoClimb } from "@/lib/product-tour-demo";
import {
  EMPTY_SEARCH,
  type AppSearchResult,
  type SearchFetcher,
  type SearchPage,
  type SearchSnapshot,
  type SearchState,
} from "@/lib/search";
import type { AreaSuggestion } from "@/lib/search-suggestions";

const AREA_PATH = `${TOUR_DEMO_AREA.path} / ${TOUR_DEMO_AREA.name}`;
const DEFAULT_RANGES = {
  boulder: DEFAULT_BOULDER_RANGE,
  sport: DEFAULT_SPORT_RANGE,
  trad: DEFAULT_TRAD_RANGE,
} as const;

/** The only area the sample catalog knows; every lookup resolves to it. */
export const demoAreaFetcher: LookupFetcher<AreaSuggestion> = async (query) =>
  TOUR_DEMO_AREA.name.toLowerCase().includes(query.trim().toLowerCase())
    ? [{ id: TOUR_DEMO_AREA.id, name: TOUR_DEMO_AREA.name, ancestorPath: TOUR_DEMO_AREA.path }]
    : [];

/** The catalog's filter semantics, applied locally: a narrowed grade range
 * drops ungraded climbs while the full range keeps them, and a narrowed
 * rating range drops unrated ones. */
function matches(climb: TourDemoClimb, state: SearchState): boolean {
  const query = state.query.trim().toLowerCase();
  if (query && !climb.name.toLowerCase().includes(query)) return false;
  const { filter } = state;
  if (filter.areaId !== undefined && filter.areaId !== TOUR_DEMO_AREA.id) return false;
  if (filter.disciplines.length > 0) {
    if (!filter.disciplines.includes(climb.type)) return false;
    const range = filter[`${climb.type}Range`];
    const [defaultMin, defaultMax] = DEFAULT_RANGES[climb.type];
    const narrowed = range[0] !== defaultMin || range[1] !== defaultMax;
    if (narrowed && (climb.grade === null || climb.grade < range[0] || climb.grade > range[1]))
      return false;
  }
  const [minRating, maxRating] = filter.ratingRange;
  if (minRating > 1 && (climb.avgRating === null || climb.avgRating < minRating)) return false;
  if (maxRating > 0 && maxRating < MAX_RATING && (climb.avgRating ?? 0) > maxRating) return false;
  return climb.sendCount >= filter.minAscents;
}

/** Sort key, name, then id — nulls last in either direction, as the catalog orders them. */
function compare(a: TourDemoClimb, b: TourDemoClimb, sort: SearchState["sort"]): number {
  const [field, direction] = sort.split("_") as [string, "asc" | "desc"];
  const sign = direction === "desc" ? -1 : 1;
  if (field === "name") return sign * a.name.localeCompare(b.name) || a.id - b.id;
  const value = (climb: TourDemoClimb) =>
    field === "grade" ? climb.grade : field === "rating" ? climb.avgRating : climb.sendCount;
  const [x, y] = [value(a), value(b)];
  if (x === null || y === null) return x === y ? a.name.localeCompare(b.name) : x === null ? 1 : -1;
  return sign * (x - y) || a.name.localeCompare(b.name) || a.id - b.id;
}

function demoPage(state: SearchState): SearchPage {
  const items = TOUR_DEMO_CLIMBS.filter((climb) => matches(climb, state))
    .sort((a, b) => compare(a, b, state.sort))
    .map((climb): AppSearchResult => ({
      id: `demo-climb-${climb.id}`,
      kind: "climb",
      name: climb.name,
      detail: AREA_PATH,
      discipline: climb.type,
      grade: climb.grade,
      stats: { avgRating: climb.avgRating, sendCount: climb.sendCount },
      href: "",
      climb: {
        id: climb.id,
        name: climb.name,
        areaId: TOUR_DEMO_AREA.id,
        areaName: TOUR_DEMO_AREA.name,
        type: climb.type,
        grade: climb.grade,
      },
      context: { ancestors: [], sendCount: climb.sendCount, sent: climb.sent },
    }));
  return { items, hasMore: false, nextPage: 2 };
}

const fetchDemo: SearchFetcher = async (state, kind) =>
  kind === "climb" ? demoPage(state) : { items: [], hasMore: false, nextPage: 2 };

const initialState: SearchState = withClimbFilterArea(
  { ...EMPTY_SEARCH, category: "climb" },
  { id: String(TOUR_DEMO_AREA.id), name: TOUR_DEMO_AREA.name, path: TOUR_DEMO_AREA.path },
);
const initial: SearchSnapshot = [{ kind: "climb", status: "ready", page: demoPage(initialState) }];

/** The Find climbs page over Pine Canyon's sample catalog: the live search
 * controller with local transport, so every filter and sort really narrows
 * the list, and selections stay on this page. */
export function DemoClimbSearch() {
  const [state, setState] = useState(initialState);
  const [selected, setSelected] = useState("");
  return (
    <section aria-label="Find climbs" className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Find climbs</h1>
        <p className="text-sm text-muted">
          Browse an area by grade, rating and ascents, or search by name.
        </p>
      </div>
      <SearchController
        initial={initial}
        state={state}
        onChange={setState}
        fetcher={fetchDemo}
        areaFetcher={demoAreaFetcher}
        filtersTourTarget="climb-filters"
        onNavigate={(item) => setSelected(item.name)}
        onExpand={() => {}}
      />
      {selected && <p role="status">Selected {selected}</p>}
    </section>
  );
}
