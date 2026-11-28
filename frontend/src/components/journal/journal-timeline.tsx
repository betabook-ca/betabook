"use client";

import { NavigationPendingRegion } from "@/components/app-shell/navigation-pending";
import { DatedLogbookRows } from "@/components/journal/dated-logbook-rows";
import { fetchJournalPage } from "@/components/journal/fetch-journal-page";
import { JournalEntryRow } from "@/components/journal/journal-entry-row";
import { LogEntryButton } from "@/components/journal/log-entry-button";
import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import { usePagedList } from "@/hooks/use-paged-list";
import type { AreaBreadcrumbs } from "@/lib/catalog-types";
import type { JournalFilter } from "@/lib/filters/journal-filter";
import type { JournalEntry } from "@/lib/logbook-types";

type JournalTimelineProps = {
  userId: string;
  filter: JournalFilter;
  initialEntries: JournalEntry[];
  initialHasMore: boolean;
  initialAreaBreadcrumbs: AreaBreadcrumbs;
  isOwner: boolean;
  hasAnyEntries: boolean;
  pending?: boolean;
};

export function JournalTimeline({
  userId,
  filter,
  initialEntries,
  initialHasMore,
  initialAreaBreadcrumbs,
  isOwner,
  hasAnyEntries,
  pending = false,
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
      <NavigationPendingRegion pending={pending}>
        <EmptyState
          message={hasAnyEntries ? "No entries match these filters." : "No entries yet."}
          cta={
            isOwner && !hasAnyEntries ? (
              <div className="flex flex-col items-center gap-3">
                <LogEntryButton />
                <AppLink href="/account/import" className="text-sm">
                  Import your sends
                </AppLink>
              </div>
            ) : undefined
          }
        />
      </NavigationPendingRegion>
    );
  }

  return (
    <NavigationPendingRegion pending={pending} className="flex flex-col gap-4">
      <DatedLogbookRows
        items={items}
        itemKey={(entry) => entry.id}
        dateOf={(entry) => entry.entryDate}
        pending={pending}
        renderRow={(entry, dateDisplay) => (
          <JournalEntryRow
            entry={entry}
            dateDisplay={dateDisplay}
            isOwner={isOwner}
            userId={userId}
            filter={filter}
            areaBreadcrumbs={meta}
          />
        )}
      />
      {hasMore && !pending && (
        <LoadMoreButton onPress={loadMore} loading={loadingMore} failed={loadMoreFailed} />
      )}
    </NavigationPendingRegion>
  );
}
