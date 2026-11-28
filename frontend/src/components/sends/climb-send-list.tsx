"use client";

import type { ReactNode } from "react";

import { ClimbSendListRow } from "@/components/sends/climb-send-list-row";
import { SendActionsMenu } from "@/components/sends/send-actions-menu";
import { SendListShell } from "@/components/sends/send-list-shell";
import { usePagedList } from "@/hooks/use-paged-list";
import type { Climb } from "@/lib/catalog-types";
import type { ClimbSendRow } from "@/lib/logbook-types";
import { fetchApi } from "@/spa/lib/api";

type ClimbSendListProps = {
  climb: Climb;
  initialSends: ClimbSendRow[];
  initialHasMore: boolean;
  /** Shows the actions menu on the viewer's own row (one send per climb). */
  currentUserId: string;
  emptyState?: ReactNode;
};

/** Community ascents for a single climb, one row per climber. */
export function ClimbSendList({
  climb,
  initialSends,
  initialHasMore,
  currentUserId,
  emptyState,
}: ClimbSendListProps) {
  const {
    items: sends,
    hasMore,
    loadingMore,
    loadMoreFailed,
    loadMore,
  } = usePagedList<ClimbSendRow, null>({
    initialItems: initialSends,
    initialHasMore,
    initialMeta: null,
    itemKey: (send) => send.id,
    mergeMeta: () => null,
    fetchPage: async (offset, _page, _last, signal) => {
      const params = new URLSearchParams({ offset: String(offset) });
      const data = await fetchApi("/api/climbs/{id}/sends", {
        path: { id: String(climb.id) },
        query: params,
        signal,
        sessionEvents: true,
      });
      return { items: data.sends, hasMore: data.hasMore, meta: null };
    },
  });

  return (
    <SendListShell
      sends={sends}
      emptyState={emptyState}
      hasMore={hasMore}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      loadMoreFailed={loadMoreFailed}
      renderRow={(send) => (
        <ClimbSendListRow
          type={climb.type}
          climbName={climb.name}
          send={send}
          actions={send.userId === currentUserId && <SendActionsMenu send={send} />}
        />
      )}
    />
  );
}
