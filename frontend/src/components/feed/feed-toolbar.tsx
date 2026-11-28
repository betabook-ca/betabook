import { Button } from "@heroui/react";
import type { ReactNode } from "react";

/** The row above the feed: its activity pills, then Refresh feed. Shared by
 * the feed and its loading state, which leaves out `onRefresh` to hold the
 * button until the feed is in. */
export function FeedToolbar({
  children,
  refreshing = false,
  onRefresh,
}: {
  children?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {children}
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto"
        isDisabled={!onRefresh || refreshing}
        onPress={onRefresh}
      >
        {refreshing ? "Refreshing…" : "Refresh feed"}
      </Button>
    </div>
  );
}
