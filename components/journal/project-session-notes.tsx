"use client";

import { fetchJournalPage } from "@/components/journal/fetch-journal-page";
import { ProjectSessionList } from "@/components/journal/project-session-list";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import type { JournalEntry } from "@/db/queries";
import { usePagedList } from "@/hooks/use-paged-list";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";

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
      const data = await fetchJournalPage(
        userId,
        { ...DEFAULT_JOURNAL_FILTER, view: "sessions", climbId },
        lastItem,
        signal,
      );
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
