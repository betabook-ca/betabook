import { AuthenticationRequiredError } from "@/lib/api-client";
import { climbFilterToSearchParams } from "@/lib/filters/climb-filter";
import { publicClimbSearchItems, publicSearchParams } from "@/lib/search";
import {
  areaSearchItems,
  climberSearchItems,
  climbSearchItems,
  type SearchFetcher,
} from "@/lib/search";
import { fetchApi } from "@/spa/lib/api";

/** The network boundary is injectable in stories; app IDs only come from these endpoints. */
export const fetchSearchPage: SearchFetcher = async (state, kind, page, signal) => {
  const params = climbFilterToSearchParams(state.sort, {
    ...state.filter,
    name: state.query,
  });
  params.set("page", String(page));
  if (kind === "climber") params.set("offset", String((page - 1) * 20));
  const options = { query: params, signal, sessionEvents: true };
  if (kind === "climb") {
    const data = await fetchApi("/api/search/climbs", options);
    return { items: climbSearchItems(data), hasMore: data.hasNextPage, nextPage: page + 1 };
  }
  if (kind === "area") {
    const data = await fetchApi("/api/search/areas", options);
    return { items: areaSearchItems(data.areas), hasMore: data.hasNextPage, nextPage: page + 1 };
  }
  const data = await fetchApi("/api/search/climbers", options);
  return { items: climberSearchItems(data.climbers), hasMore: data.hasMore, nextPage: page + 1 };
};

export const fetchPublicSearchPage: SearchFetcher = async (state, kind, page, signal) => {
  if (kind === "climber") throw new AuthenticationRequiredError();
  const params = publicSearchParams(state, kind);
  params.set("page", String(page));
  const options = { query: params, signal, sessionEvents: true };
  if (kind === "climb") {
    const data = await fetchApi("/api/public/search/climbs", options);
    return { items: publicClimbSearchItems(data), hasMore: data.hasNextPage, nextPage: page + 1 };
  }
  const data = await fetchApi("/api/public/search/areas", options);
  return { items: areaSearchItems(data.areas), hasMore: data.hasNextPage, nextPage: page + 1 };
};
