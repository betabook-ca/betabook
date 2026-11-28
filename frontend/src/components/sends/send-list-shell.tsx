"use client";

import type { ReactNode } from "react";

import { DatedLogbookRows, type GroupedDateDisplay } from "@/components/journal/dated-logbook-rows";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import { RowList } from "@/components/ui/row-list";

type SendListShellProps<T extends { id: number }> = {
  sends: T[];
  renderRow: (send: T, dateDisplay?: GroupedDateDisplay) => ReactNode;
  dateOf?: (send: T) => string | null;
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
  dateOf,
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
      {dateOf ? (
        <DatedLogbookRows
          items={sends}
          itemKey={(send) => send.id}
          dateOf={dateOf}
          renderRow={renderRow}
        />
      ) : (
        <RowList>
          {sends.map((send) => (
            <li key={send.id}>{renderRow(send)}</li>
          ))}
        </RowList>
      )}
      {hasMore && (
        <LoadMoreButton onPress={onLoadMore} loading={loadingMore} failed={loadMoreFailed} />
      )}
    </div>
  );
}
