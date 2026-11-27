import { parseJournalFilter } from "@/lib/filters/journal-filter";
import { searchParamsToRecord } from "@/lib/url-params";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";

export function journalFilter(query: string) {
  return parseJournalFilter(searchParamsToRecord(new URLSearchParams(query)));
}

export async function refreshJournalResults(
  id: string,
  previous: ApiResponse<"/api/pages/users/{id}/journal">["journal"],
  query: string,
  signal: AbortSignal,
) {
  const page = await fetchApi("/api/users/{id}/journal", {
    path: { id },
    query: new URLSearchParams(query),
    signal,
    sessionEvents: true,
  });
  return {
    ...previous,
    firstPage: { entries: page.entries, hasMore: page.hasMore },
    areaBreadcrumbs: page.areaBreadcrumbs,
  };
}
