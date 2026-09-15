"use client";

import { ProjectSessionList } from "@/components/journal/project-session-list";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import type { JournalEntry } from "@/db/queries";
import { usePagedList } from "@/hooks/use-paged-list";
import { apiFetch } from "@/lib/api-client";
import { DEFAULT_JOURNAL_FILTER, journalFilterToSearchParams } from "@/lib/filters/journal-filter";

type ProjectSessionNotesProps = {
  userId: string;
  climbId: number;
  /** Includes sessions that weren't preloaded. */
  sessionCount: number;
  initialSessions: JournalEntry[];
};

export function ProjectSessionNotes({
  userId,
  climbId,
  sessionCount,
  initialSessions,
}: ProjectSessionNotesProps) {
  const { items, hasMore, loadingMore, loadMoreFailed, loadMore } = usePagedList<
    JournalEntry,
    null
  >({
    initialItems: initialSessions,
    initialHasMore: sessionCount > initialSessions.length,
    initialMeta: null,
    itemKey: (entry) => entry.id,
    fetchPage: async (_offset, _page, lastItem, signal) => {
      const params = journalFilterToSearchParams({
        ...DEFAULT_JOURNAL_FILTER,
        view: "sessions",
        climbId,
      });
      if (lastItem) {
        params.set("cursorDate", lastItem.entryDate);
        params.set("cursorId", String(lastItem.id));
      }
      const response = await apiFetch(`/api/users/${userId}/journal?${params}`, { signal });
      if (!response.ok) throw new Error("Failed to load more sessions");
      const data = (await response.json()) as { entries: JournalEntry[]; hasMore: boolean };
      return { items: data.entries, hasMore: data.hasMore, meta: null };
    },
    mergeMeta: () => null,
  });

  return (
    <div className="flex flex-col gap-4">
      <ProjectSessionList sessions={items} />
      {hasMore && (
        <LoadMoreButton onPress={loadMore} loading={loadingMore} failed={loadMoreFailed} />
      )}
    </div>
  );
}
