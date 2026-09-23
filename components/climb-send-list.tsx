"use client";

import type { ReactNode } from "react";

import { ClimbSendListRow } from "@/components/climb-send-list-row";
import { SendActionsMenu } from "@/components/send-actions-menu";
import { SendListShell } from "@/components/send-list-shell";
import { ViewerBoundary } from "@/components/viewer-boundary";
import type { Climb, ClimbSendRow, ClimbSendsPage } from "@/db/queries";
import { usePagedList } from "@/hooks/use-paged-list";
import { apiFetch } from "@/lib/api-client";

type ClimbSendListProps = {
  climb: Climb;
  initialSends: ClimbSendRow[];
  initialHasMore: boolean;
  /** Shows the actions menu on the viewer's own row (one send per climb). */
  currentUserId: string;
  emptyState?: ReactNode;
};

/** Community ascents for a single climb, one row per climber. */
export function ClimbSendList(props: ClimbSendListProps) {
  return (
    <ViewerBoundary viewerId={props.currentUserId}>
      <ClimbSendListContent {...props} />
    </ViewerBoundary>
  );
}

function ClimbSendListContent({
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
      const res = await apiFetch(`/api/climbs/${climb.id}/sends?${params.toString()}`, {
        cache: "no-store",
        signal,
      });
      if (!res.ok) throw new Error(`Loading sends failed: ${res.status}`);
      const data: ClimbSendsPage = await res.json();
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
          send={send}
          actions={send.userId === currentUserId && <SendActionsMenu send={send} />}
        />
      )}
    />
  );
}
