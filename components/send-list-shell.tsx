"use client";

import type { ReactNode } from "react";

import { SendRows } from "@/components/send-rows";
import { LoadMoreButton } from "@/components/ui/load-more-button";

type SendListShellProps<T extends { id: number }> = {
  sends: T[];
  renderRow: (send: T) => ReactNode;
  emptyState: ReactNode;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
  loadMoreFailed: boolean;
};

/** Rows and "load more" for a list of sends the caller pages from the server. */
export function SendListShell<T extends { id: number }>({
  sends,
  renderRow,
  emptyState,
  hasMore,
  onLoadMore,
  loadingMore,
  loadMoreFailed,
}: SendListShellProps<T>) {
  if (sends.length === 0) {
    return emptyState;
  }

  return (
    <div className="flex flex-col gap-4">
      <SendRows>
        {sends.map((send) => (
          <li key={send.id}>{renderRow(send)}</li>
        ))}
      </SendRows>
      {hasMore && (
        <LoadMoreButton onPress={onLoadMore} loading={loadingMore} failed={loadMoreFailed} />
      )}
    </div>
  );
}
