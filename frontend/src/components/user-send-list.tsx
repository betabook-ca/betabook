"use client";

import { UserSendLogRow } from "@/components/climb-log-row";
import { LogEntryButton } from "@/components/journal";
import { NavigationPendingRegion } from "@/components/navigation-pending";
import { SendActionsMenu } from "@/components/send-actions-menu";
import { SendListShell } from "@/components/send-list-shell";
import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import type { AreaBreadcrumbs, UserSendRow, UserSendsFilter } from "@/db/queries";
import { usePagedList } from "@/hooks/use-paged-list";
import { userSendsFilterToSearchParams } from "@/lib/filters/user-sends-filter";
import { fetchApi } from "@/spa/lib/api";

type UserSendListProps = {
  userId: string;
  filter: UserSendsFilter;
  initialSends: UserSendRow[];
  initialHasMore: boolean;
  initialAreaBreadcrumbs: AreaBreadcrumbs;
  /** Distinguishes an empty logbook from a filter with no matches. */
  hasAnySends: boolean;
  currentUserId: string;
  pending?: boolean;
};

/** Key the list by filters. Same-key refreshes revalidate the loaded depth
 * after send edits, deletion or returning to the tab. */
export function UserSendList({
  userId,
  filter,
  initialSends,
  initialHasMore,
  initialAreaBreadcrumbs,
  hasAnySends,
  currentUserId,
  pending = false,
}: UserSendListProps) {
  const {
    items: sends,
    hasMore,
    meta: areaBreadcrumbs,
    loadingMore,
    loadMoreFailed,
    loadMore,
  } = usePagedList({
    initialItems: initialSends,
    initialHasMore,
    initialMeta: initialAreaBreadcrumbs,
    itemKey: (send) => send.id,
    mergeMeta: (current, incoming) => ({ ...current, ...incoming }),
    fetchPage: async (offset, _page, _last, signal) => {
      const params = userSendsFilterToSearchParams(filter);
      params.set("offset", String(offset));
      const data = await fetchApi("/api/users/{id}/sends", {
        path: { id: userId },
        query: params,
        signal,
        sessionEvents: true,
      });
      return {
        items: data.sends,
        hasMore: data.hasMore,
        meta: data.areaBreadcrumbs,
      };
    },
  });

  if (!hasAnySends) {
    return (
      <EmptyState
        message="No sends yet."
        cta={
          currentUserId === userId ? (
            <div className="flex flex-col items-center gap-3">
              <LogEntryButton />
              <AppLink href="/account/import" className="text-sm">
                Import your sends
              </AppLink>
            </div>
          ) : undefined
        }
      />
    );
  }

  return (
    <NavigationPendingRegion pending={pending}>
      <SendListShell
        sends={sends}
        emptyState={<EmptyState message="No sends match these filters." />}
        hasMore={hasMore}
        onLoadMore={loadMore}
        loadingMore={pending || loadingMore}
        loadMoreFailed={loadMoreFailed}
        renderRow={(send) => (
          <UserSendLogRow
            send={send}
            areaBreadcrumbs={areaBreadcrumbs}
            actions={currentUserId === userId && <SendActionsMenu send={send} />}
          />
        )}
      />
    </NavigationPendingRegion>
  );
}
