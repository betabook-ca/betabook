"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";

import { FeedTimeline } from "@/components/feed-timeline";
import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import type { FeedDay, FeedPage } from "@/db/queries";
import { useClientSession } from "@/hooks/use-client-session";
import { usePagedList } from "@/hooks/use-paged-list";
import { apiFetch } from "@/lib/api-client";
import type { FeedCursor, FeedView } from "@/lib/feed";
import { signInUrl } from "@/lib/sign-in-redirect";

export function FeedList({
  initialPage,
  view,
  hasFriends,
  viewerId,
  toolbar,
}: {
  initialPage: FeedPage;
  view: FeedView;
  hasFriends: boolean;
  viewerId: string;
  /** Shares a row with Refresh feed. */
  toolbar?: ReactNode;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const session = useClientSession();
  const { items, hasMore, loadingMore, loadMoreFailed, loadMore } = usePagedList<FeedDay, null>({
    initialItems: initialPage.days,
    initialHasMore: initialPage.hasMore,
    initialMeta: null,
    itemKey: (day) => JSON.stringify([day.date, day.userId]),
    mergeMeta: () => null,
    fetchPage: async (_offset, _page, last, signal) => {
      const params = new URLSearchParams({ view });
      if (last)
        params.set(
          "cursor",
          JSON.stringify({
            version: 1,
            date: last.date,
            userId: last.userId,
            view,
          } satisfies FeedCursor),
        );
      const response = await apiFetch(`/api/feed?${params}`, { cache: "no-store", signal });
      if (response.status === 401) router.replace(signInUrl("/feed"));
      if (!response.ok) throw new Error("Couldn't load feed");
      const page = (await response.json()) as FeedPage;
      return { items: page.days, hasMore: page.hasMore, meta: null };
    },
  });
  if (session !== undefined && session?.user.id !== viewerId)
    return (
      <EmptyState
        message={
          session ? "Your account changed. Refresh to see your feed." : "Sign in to see your feed."
        }
        cta={
          session ? (
            <Button onPress={() => router.refresh()}>Refresh feed</Button>
          ) : (
            <AppLink href={signInUrl("/feed")}>Sign in</AppLink>
          )
        }
      />
    );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {toolbar}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          isDisabled={refreshing}
          onPress={() => startRefresh(() => router.refresh())}
        >
          {refreshing ? "Refreshing…" : "Refresh feed"}
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState
          message={
            !hasFriends
              ? "Add friends to see what they've been climbing."
              : view === "sends"
                ? "No sends to show yet."
                : "No activity to show yet."
          }
          cta={<AppLink href="/search?mode=climber">Find climbers</AppLink>}
        />
      ) : (
        <>
          <FeedTimeline days={items} view={view} />
          {hasMore ? (
            <LoadMoreButton onPress={loadMore} loading={loadingMore} failed={loadMoreFailed} />
          ) : (
            <p className="text-center text-sm text-muted">End of feed</p>
          )}
        </>
      )}
    </div>
  );
}
