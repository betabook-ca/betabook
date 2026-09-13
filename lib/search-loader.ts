import { getDb } from "@/db/client";
import {
  getAreaBreadcrumbs,
  getClimbSendStats,
  getClimberSuggestions,
  getClimbersPage,
  getUserSentClimbIds,
  searchAreas,
  searchClimbs,
  type SuggestedClimberRow,
} from "@/db/queries";
import { getPublicArea, searchPublicAreas, searchPublicClimbs } from "@/db/queries/public-catalog";
import type { AreaSelection } from "@/lib/area-selection";
import { toClimbQueryParams } from "@/lib/filters/climb-filter";
import { publicCatalogOptions } from "@/lib/public-catalog";
import { publicClimbSearchItems, publicSearchParams } from "@/lib/search";
import {
  areaSearchItems,
  climberSearchItems,
  climbSearchItems,
  SEARCH_KINDS,
  showsClimberSuggestions,
  type SearchSnapshot,
  type SearchState,
} from "@/lib/search";

export async function loadAreaSelection(id: number | undefined): Promise<AreaSelection | null> {
  if (id === undefined) return null;
  const db = await getDb();
  const area = await getPublicArea(db, id);
  if (!area) return { id: String(id), name: "Unavailable area", path: "" };
  const ancestors = await getAreaBreadcrumbs(db, [id]);
  return {
    id: String(id),
    name: area.name,
    path: (ancestors[id] ?? []).map((item) => item.name).join(" / "),
  };
}

/** An empty climber search shows suggestions; later arrivals load them on the client. */
export async function loadClimberSuggestions(
  state: SearchState,
  viewerId: string | null,
): Promise<SuggestedClimberRow[] | null> {
  if (!showsClimberSuggestions(state, viewerId)) return null;
  try {
    return await getClimberSuggestions(await getDb(), viewerId);
  } catch {
    return null;
  }
}

/** First-page HTML uses the same record mapping as subsequent API responses. */
export async function loadSearch(
  state: SearchState,
  viewerId: string | null,
): Promise<SearchSnapshot> {
  const kinds = state.category === "all" ? SEARCH_KINDS : [state.category];
  if (!viewerId) {
    const db = await getDb();
    return Promise.all(
      kinds.map(async (kind) => {
        if (kind === "climber")
          return {
            kind,
            page: { items: [], hasMore: false, nextPage: 1 },
            status: "locked" as const,
          };
        if (!state.query.trim())
          return {
            kind,
            page: { items: [], hasMore: false, nextPage: 1 },
            status: "idle" as const,
          };
        const options = publicCatalogOptions(publicSearchParams(state, kind));
        const page =
          kind === "area"
            ? await searchPublicAreas(db, options)
            : await searchPublicClimbs(db, options);
        return {
          kind,
          page: {
            items: "areas" in page ? areaSearchItems(page.areas) : publicClimbSearchItems(page),
            hasMore: page.hasNextPage,
            nextPage: 2,
          },
          status: "ready" as const,
        };
      }),
    );
  }
  if (!state.query.trim())
    return kinds.map((kind) => ({
      kind,
      page: { items: [], hasMore: false, nextPage: 1 },
      status: "idle",
    }));
  const db = await getDb();
  return Promise.all(
    kinds.map(async (kind) => {
      try {
        if (kind === "area") {
          const page = await searchAreas(db, state.query);
          return {
            kind,
            page: { items: areaSearchItems(page.areas), hasMore: page.hasNextPage, nextPage: 2 },
            status: "ready",
          };
        }
        if (kind === "climber") {
          const page = await getClimbersPage(db, viewerId, { name: state.query });
          return {
            kind,
            page: { items: climberSearchItems(page.climbers), hasMore: page.hasMore, nextPage: 2 },
            status: "ready",
          };
        }
        const page = await searchClimbs(
          db,
          toClimbQueryParams({ ...state.filter, name: state.query }, state.sort),
        );
        const ids = page.climbs.map((climb) => climb.id);
        const [sendStats, areaBreadcrumbs, sent] = await Promise.all([
          getClimbSendStats(db, ids),
          getAreaBreadcrumbs(
            db,
            page.climbs.map((climb) => climb.areaId),
          ),
          viewerId ? getUserSentClimbIds(db, viewerId, ids) : undefined,
        ]);
        return {
          kind,
          page: {
            items: climbSearchItems({
              ...page,
              sendStats,
              areaBreadcrumbs,
              sentClimbIds: sent ? [...sent] : undefined,
            }),
            hasMore: page.hasNextPage,
            nextPage: 2,
          },
          status: "ready",
        };
      } catch {
        return { kind, page: { items: [], hasMore: false, nextPage: 1 }, status: "error" };
      }
    }),
  );
}
