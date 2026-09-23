"use client";

import { ClimbList } from "@/components/climb-list";
import { NavigationPendingRegion } from "@/components/navigation-pending";
import type {
  AreaBreadcrumbs,
  ClimbSendStats,
  ClimbWithAreaName,
  SubtreeClimbsSort,
} from "@/db/queries";
import { usePagedList } from "@/hooks/use-paged-list";
import { apiFetch } from "@/lib/api-client";
import { createClimbListMeta, mergeClimbListMeta } from "@/lib/climb-list-pages";
import {
  areaClimbsFilterToSearchParams,
  type AreaClimbsFilter,
} from "@/lib/filters/area-climbs-filter";

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
    fetchPage: async (offset) => {
      const params = areaClimbsFilterToSearchParams(sort, filter);
      params.set("offset", String(offset));
      const res = await apiFetch(`/api/areas/${areaId}/climbs?${params.toString()}`);
      if (!res.ok) throw new Error(`Loading more climbs failed: ${res.status}`);
      const data: {
        climbs: ClimbWithAreaName[];
        hasNextPage: boolean;
        sendStats: Record<number, ClimbSendStats>;
        areaBreadcrumbs: AreaBreadcrumbs;
        sentClimbIds?: number[];
      } = await res.json();
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
      <NavigationPendingRegion>
        <ClimbList
          climbs={climbs}
          emptyMessage={emptyMessage}
          sendStats={sendStats}
          areaBreadcrumbs={areaBreadcrumbs}
          sentClimbIds={visibleSentClimbIds}
          pagination={{
            hasNextPage,
            loadingMore,
            onLoadMore: loadMore,
            failed: loadMoreFailed,
          }}
        />
      </NavigationPendingRegion>
    </section>
  );
}
