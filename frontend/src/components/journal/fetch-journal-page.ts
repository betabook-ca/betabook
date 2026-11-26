import type { JournalEntry } from "@/db/queries";
import { journalFilterToSearchParams, type JournalFilter } from "@/lib/filters/journal-filter";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";

export type JournalPage = ApiResponse<"/api/users/{id}/journal">;

/** The page after `lastItem` in the owner's journal, keyed by the (date, id) cursor. */
export async function fetchJournalPage(
  userId: string,
  filter: JournalFilter,
  lastItem: Pick<JournalEntry, "entryDate" | "id"> | undefined,
  signal: AbortSignal,
): Promise<JournalPage> {
  const params = journalFilterToSearchParams(filter);
  if (lastItem) {
    params.set("cursorDate", lastItem.entryDate);
    params.set("cursorId", String(lastItem.id));
  }
  return fetchApi("/api/users/{id}/journal", {
    path: { id: userId },
    query: params,
    signal,
    sessionEvents: true,
  });
}
