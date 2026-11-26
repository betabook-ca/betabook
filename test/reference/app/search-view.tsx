import { AppSearch } from "@/components/search/app-search";
import { parseSearchState, type SearchCategory } from "@/lib/search";
import { loadAreaSelection, loadClimberSuggestions, loadSearch } from "@/lib/search-loader";
import type { UrlParamsRecord } from "@/lib/url-params";

/** The server half of the full search, shared by the signed-out landing page
 * and /search. First-page results render as HTML; the client then owns the
 * URL state and refetches through the API. */
export async function SearchView({
  params,
  viewerId,
  defaultCategory,
  showMemberNotice,
  memberNoticePlacement,
}: {
  params: UrlParamsRecord;
  viewerId: string | null;
  defaultCategory: SearchCategory;
  showMemberNotice: boolean;
  memberNoticePlacement?: "results" | "top";
}) {
  const state = parseSearchState(params, null, defaultCategory);
  state.area = await loadAreaSelection(state.filter.areaId);
  const [initial, suggestions] = await Promise.all([
    loadSearch(state, viewerId),
    loadClimberSuggestions(state, viewerId),
  ]);
  return (
    <AppSearch
      initialState={state}
      initial={initial}
      suggestions={suggestions}
      viewerId={viewerId}
      defaultCategory={defaultCategory}
      showMemberNotice={showMemberNotice}
      memberNoticePlacement={memberNoticePlacement}
    />
  );
}
