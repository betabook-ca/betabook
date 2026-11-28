"use client";

import { ClimbList } from "@/components/climbs/climb-list";
import { usePagedList } from "@/hooks/use-paged-list";
import type { PublicClimb, PublicClimbsPage } from "@/lib/public-catalog";
import { fetchApi } from "@/spa/lib/api";

/** Suggested grade stays behind a session; the other two aggregates do not. */
function publicSendStats(climbs: PublicClimb[]) {
  return Object.fromEntries(
    climbs.map((climb) => [
      climb.id,
      { avgRating: climb.avgRating, sendCount: climb.sendCount, avgSuggestedGrade: null },
    ]),
  );
}

function windowStart(params: URLSearchParams, firstPageSize: number) {
  const byOffset = params.has("offset");
  const raw = params.get(byOffset ? "offset" : "page") ?? "";
  const value = Number(raw);
  // The Worker accepts decimal numbers. Invalid values start at the first row.
  if (!Number.isFinite(value) || value !== Number.parseFloat(raw) || value <= 0) return 0;
  if (byOffset) return Number.isInteger(value) ? value : 0;
  // Load more exists only if the initial response filled its entire page.
  return Math.max(0, Math.trunc(value) - 1) * firstPageSize;
}

export function PublicClimbList({
  initial,
  areaId,
  query,
  pending = false,
}: {
  initial: PublicClimbsPage;
  areaId: number;
  query: string;
  pending?: boolean;
}) {
  const list = usePagedList({
    initialItems: initial.climbs,
    initialHasMore: initial.hasNextPage,
    initialMeta: initial.areaBreadcrumbs,
    itemKey: (climb) => climb.id,
    mergeMeta: (current, incoming) => ({ ...current, ...incoming }),
    fetchPage: async (offset, _page, _last, signal) => {
      const params = new URLSearchParams(query);
      params.set("offset", String(windowStart(params, initial.climbs.length) + offset));
      params.delete("page");
      const page = await fetchApi("/api/public/areas/{id}/climbs", {
        path: { id: String(areaId) },
        query: params,
        signal,
      });
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
        loadingMore: pending || list.loadingMore,
        onLoadMore: list.loadMore,
        failed: list.loadMoreFailed,
      }}
    />
  );
}
