import type { AreaBreadcrumbs, JournalEntry } from "@/db/queries";
import { apiFetch } from "@/lib/api-client";
import { journalFilterToSearchParams, type JournalFilter } from "@/lib/filters/journal-filter";

export type JournalPage = {
  entries: JournalEntry[];
  hasMore: boolean;
  areaBreadcrumbs: AreaBreadcrumbs;
};

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
  const res = await apiFetch(`/api/users/${userId}/journal?${params}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw new Error("Failed to load more entries");
  return (await res.json()) as JournalPage;
}
