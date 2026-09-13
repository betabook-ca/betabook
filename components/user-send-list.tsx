"use client";

import { AscentStyle } from "@/components/ascent-style";
import { ClimbLogRow } from "@/components/climb-log-row";
import { LogEntryButton } from "@/components/journal";
import { NavigationPendingRegion } from "@/components/navigation-pending";
import { SendActionsMenu } from "@/components/send-actions-menu";
import { SendGradeCell } from "@/components/send-grade-cell";
import { SendListShell } from "@/components/send-list-shell";
import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import type { AreaBreadcrumbs, UserSendRow, UserSendsFilter } from "@/db/queries";
import { usePagedList } from "@/hooks/use-paged-list";
import { apiFetch } from "@/lib/api-client";
import { userSendsFilterToSearchParams } from "@/lib/filters/user-sends-filter";

type UserSendListProps = {
  userId: string;
  filter: UserSendsFilter;
  initialSends: UserSendRow[];
  initialHasMore: boolean;
  initialAreaBreadcrumbs: AreaBreadcrumbs;
  /** Distinguishes an empty logbook from a filter with no matches. */
  hasAnySends: boolean;
  currentUserId: string;
};

type UserSendsPageResponse = {
  sends: UserSendRow[];
  hasMore: boolean;
  areaBreadcrumbs: AreaBreadcrumbs;
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
      const res = await apiFetch(`/api/users/${userId}/sends?${params.toString()}`, {
        cache: "no-store",
        signal,
      });
      if (!res.ok) throw new Error(`Loading sends failed: ${res.status}`);
      const data: UserSendsPageResponse = await res.json();
      return {
        items: data.sends,
        hasMore: data.hasMore,
        meta: data.areaBreadcrumbs,
      };
    },
  });

  if (!hasAnySends) {
    return (
      <div className="flex flex-col gap-4">
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Dimmed while the toolbar's debounced navigation is re-fetching
       * these results (see NavigationPendingProvider in the page). */}
      <NavigationPendingRegion>
        <SendListShell
          sends={sends}
          emptyState={<EmptyState message="No sends match these filters." />}
          hasMore={hasMore}
          onLoadMore={loadMore}
          loadingMore={loadingMore}
          loadMoreFailed={loadMoreFailed}
          renderRow={(send) => (
            <ClimbLogRow
              climb={{
                id: send.climbId,
                name: send.climbName,
                areaId: send.areaId,
                areaName: send.areaName,
              }}
              areaBreadcrumbs={areaBreadcrumbs}
              grade={
                <SendGradeCell
                  type={send.climbType}
                  grade={send.climbGrade}
                  suggestedGrade={send.suggestedGrade}
                  gradeFeel={send.gradeFeel}
                  rating={send.rating}
                />
              }
              status={<AscentStyle type={send.ascentStyle} />}
              date={send.dateSent}
              actions={
                currentUserId === userId && (
                  <SendActionsMenu
                    climb={{
                      id: send.climbId,
                      areaId: send.areaId,
                      type: send.climbType,
                      grade: send.climbGrade,
                    }}
                    send={send}
                  />
                )
              }
              comment={send.comment}
            />
          )}
        />
      </NavigationPendingRegion>
    </div>
  );
}
