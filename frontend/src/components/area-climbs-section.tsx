"use client";

import { ClimbList } from "@/components/climb-list";
import { NavigationPendingRegion } from "@/components/navigation-pending";
import { usePagedList } from "@/hooks/use-paged-list";
import type { AreaBreadcrumbs, ClimbSendStats, ClimbWithAreaName } from "@/lib/catalog-types";
import { createClimbListMeta, mergeClimbListMeta } from "@/lib/climb-list-pages";
import type { SubtreeClimbsSort } from "@/lib/climb-list-sort";
import {
  areaClimbsFilterToSearchParams,
  type AreaClimbsFilter,
} from "@/lib/filters/area-climbs-filter";
import { fetchApi } from "@/spa/lib/api";

type AreaClimbsSectionProps = {
  areaId: number;
  sort: SubtreeClimbsSort;
  filter: AreaClimbsFilter;
  initialClimbs: ClimbWithAreaName[];
  initialHasNextPage: boolean;
  initialSendStats: Record<number, ClimbSendStats>;
  initialAreaBreadcrumbs: AreaBreadcrumbs;
  sentClimbIds?: Set<number>;
  emptyMessage?: string;
  pending?: boolean;
};

/** The caller keys this on `{ sort, filter }` so a change remounts it with
 * fresh paging state instead of syncing accumulated pages to new props. */
export function AreaClimbsSection({
  areaId,
  sort,
  filter,
  initialClimbs,
  initialHasNextPage,
  initialSendStats,
  initialAreaBreadcrumbs,
  sentClimbIds,
  emptyMessage,
  pending = false,
}: AreaClimbsSectionProps) {
  const initialMeta = createClimbListMeta({
    sendStats: initialSendStats,
    areaBreadcrumbs: initialAreaBreadcrumbs,
    sentClimbIds,
  });

  const {
    items: climbs,
    hasMore: hasNextPage,
    meta: { sendStats, areaBreadcrumbs, sentClimbIds: visibleSentClimbIds },
    loadingMore,
    loadMoreFailed,
    loadMore,
  } = usePagedList({
    initialItems: initialClimbs,
    initialHasMore: initialHasNextPage,
    initialMeta,
    itemKey: (climb) => climb.id,
    mergeMeta: mergeClimbListMeta,
    fetchPage: async (offset, _page, _last, signal) => {
      const params = areaClimbsFilterToSearchParams(sort, filter);
      params.set("offset", String(offset));
      const data = await fetchApi("/api/areas/{id}/climbs", {
        path: { id: String(areaId) },
        query: params,
        signal,
        sessionEvents: true,
      });
      return {
        items: data.climbs,
        hasMore: data.hasNextPage,
        meta: createClimbListMeta(data),
      };
    },
  });

  return (
    <section className="flex flex-col gap-2">
      {/* Dimmed while the toolbar's debounced navigation is re-fetching
       * these results (see NavigationPendingProvider in the page). */}
      <NavigationPendingRegion pending={pending}>
        <ClimbList
          climbs={climbs}
          emptyMessage={emptyMessage}
          sendStats={sendStats}
          areaBreadcrumbs={areaBreadcrumbs}
          sentClimbIds={visibleSentClimbIds}
          pagination={{
            hasNextPage,
            loadingMore: pending || loadingMore,
            onLoadMore: loadMore,
            failed: loadMoreFailed,
          }}
        />
      </NavigationPendingRegion>
    </section>
  );
}
