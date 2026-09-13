import type { AreaWithAncestorPath, ClimbersPage } from "@/db/queries";
import { AuthenticationRequiredError } from "@/lib/api-client";
import { apiFetch } from "@/lib/api-client";
import type { ClimbListPage } from "@/lib/climb-list-pages";
import { climbFilterToSearchParams } from "@/lib/filters/climb-filter";
import type { PublicAreaResult, PublicClimbsPage } from "@/lib/public-catalog";
import { publicClimbSearchItems, publicSearchParams } from "@/lib/search";
import {
  areaSearchItems,
  climberSearchItems,
  climbSearchItems,
  type SearchFetcher,
} from "@/lib/search";

/** The network boundary is injectable in stories; app IDs only come from these endpoints. */
export const fetchSearchPage: SearchFetcher = async (state, kind, page, signal) => {
  const params = climbFilterToSearchParams(state.sort, {
    ...state.filter,
    name: state.query,
  });
  params.set("page", String(page));
  if (kind === "climber") params.set("offset", String((page - 1) * 20));
  const response = await apiFetch(
    `/api/search/${kind === "climb" ? "climbs" : kind === "area" ? "areas" : "climbers"}?${params}`,
    { signal, cache: "no-store" },
  );
  if (!response.ok) throw new Error("Search unavailable");
  if (kind === "climb") {
    const data = (await response.json()) as ClimbListPage;
    return { items: climbSearchItems(data), hasMore: data.hasNextPage, nextPage: page + 1 };
  }
  if (kind === "area") {
    const data = (await response.json()) as { areas: AreaWithAncestorPath[]; hasNextPage: boolean };
    return { items: areaSearchItems(data.areas), hasMore: data.hasNextPage, nextPage: page + 1 };
  }
  const data = (await response.json()) as ClimbersPage;
  return { items: climberSearchItems(data.climbers), hasMore: data.hasMore, nextPage: page + 1 };
};

export const fetchPublicSearchPage: SearchFetcher = async (state, kind, page, signal) => {
  if (kind === "climber") throw new AuthenticationRequiredError();
  const params = publicSearchParams(state, kind);
  params.set("page", String(page));
  const response = await apiFetch(
    `/api/public/search/${kind === "climb" ? "climbs" : "areas"}?${params}`,
    { signal },
  );
  if (!response.ok) throw new Error("Search unavailable");
  if (kind === "climb") {
    const data: PublicClimbsPage = await response.json();
    return { items: publicClimbSearchItems(data), hasMore: data.hasNextPage, nextPage: page + 1 };
  }
  const data: { areas: PublicAreaResult[]; hasNextPage: boolean } = await response.json();
  return { items: areaSearchItems(data.areas), hasMore: data.hasNextPage, nextPage: page + 1 };
};
