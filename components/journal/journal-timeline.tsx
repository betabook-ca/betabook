"use client";

import { fetchJournalPage } from "@/components/journal/fetch-journal-page";
import { JournalEntryRow } from "@/components/journal/journal-entry-row";
import { NavigationPendingRegion } from "@/components/navigation-pending";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import type { AreaBreadcrumbs, JournalEntry } from "@/db/queries";
import { usePagedList } from "@/hooks/use-paged-list";
import type { JournalFilter } from "@/lib/filters/journal-filter";

type JournalTimelineProps = {
  userId: string;
  filter: JournalFilter;
  initialEntries: JournalEntry[];
  initialHasMore: boolean;
  initialAreaBreadcrumbs: AreaBreadcrumbs;
  isOwner: boolean;
  hasAnyEntries: boolean;
};

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function monthLabel(entryDate: string): string {
  return MONTH_FORMAT.format(new Date(`${entryDate.slice(0, 7)}-01`));
}

export function JournalTimeline({
  userId,
  filter,
  initialEntries,
  initialHasMore,
  initialAreaBreadcrumbs,
  isOwner,
  hasAnyEntries,
}: JournalTimelineProps) {
  const { items, hasMore, meta, loadingMore, loadMoreFailed, loadMore } = usePagedList<
    JournalEntry,
    AreaBreadcrumbs
  >({
    initialItems: initialEntries,
    initialHasMore,
    initialMeta: initialAreaBreadcrumbs,
    itemKey: (entry) => entry.id,
    fetchPage: async (_offset, _page, lastItem, signal) => {
      const data = await fetchJournalPage(userId, filter, lastItem, signal);
      return { items: data.entries, hasMore: data.hasMore, meta: data.areaBreadcrumbs };
    },
    mergeMeta: (current, incoming) => ({ ...current, ...incoming }),
  });

  if (items.length === 0) {
    return (
      <EmptyState
        message={hasAnyEntries ? "No entries match these filters." : "Nothing logged yet."}
      />
    );
  }

  return (
    <NavigationPendingRegion className="flex flex-col gap-4">
      <div className="flex flex-col">
        {items.map((entry, index) => {
          const month = monthLabel(entry.entryDate);
          const newMonth = index === 0 || month !== monthLabel(items[index - 1].entryDate);
          return (
            <div key={entry.id}>
              {newMonth && (
                <h3 className="sticky top-0 z-10 border-b border-separator bg-background px-4 py-2 text-xs font-medium tracking-widest text-muted uppercase">
                  {month}
                </h3>
              )}
              <div className="border-b border-separator">
                <JournalEntryRow
                  entry={entry}
                  isOwner={isOwner}
                  userId={userId}
                  filter={filter}
                  areaBreadcrumbs={meta}
                />
              </div>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <LoadMoreButton onPress={loadMore} loading={loadingMore} failed={loadMoreFailed} />
      )}
    </NavigationPendingRegion>
  );
}
