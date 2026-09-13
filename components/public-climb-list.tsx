"use client";

import { ClimbList } from "@/components/climb-list";
import { usePagedList } from "@/hooks/use-paged-list";
import type { PublicClimb, PublicClimbsPage } from "@/lib/public-catalog";

/** Suggested grade stays behind a session; the other two aggregates do not. */
function publicSendStats(climbs: PublicClimb[]) {
  return Object.fromEntries(
    climbs.map((climb) => [
      climb.id,
      { avgRating: climb.avgRating, sendCount: climb.sendCount, avgSuggestedGrade: null },
    ]),
  );
}

export function PublicClimbList({
  initial,
  areaId,
  query,
}: {
  initial: PublicClimbsPage;
  areaId: number;
  query: string;
}) {
  const list = usePagedList({
    initialItems: initial.climbs,
    initialHasMore: initial.hasNextPage,
    initialMeta: initial.areaBreadcrumbs,
    itemKey: (climb) => climb.id,
    mergeMeta: (current, incoming) => ({ ...current, ...incoming }),
    fetchPage: async (offset, _page, _last, signal) => {
      const params = new URLSearchParams(query);
      params.set("offset", String(offset));
      const response = await fetch(`/api/public/areas/${areaId}/climbs?${params}`, { signal });
      if (!response.ok) throw new Error("Could not load climbs");
      const page: PublicClimbsPage = await response.json();
      return { items: page.climbs, hasMore: page.hasNextPage, meta: page.areaBreadcrumbs };
    },
  });
  return (
    <ClimbList
      climbs={list.items}
      emptyMessage="No climbs match in this area."
      sendStats={publicSendStats(list.items)}
      areaBreadcrumbs={list.meta}
      pagination={{
        hasNextPage: list.hasMore,
        loadingMore: list.loadingMore,
        onLoadMore: list.loadMore,
        failed: list.loadMoreFailed,
      }}
    />
  );
}
