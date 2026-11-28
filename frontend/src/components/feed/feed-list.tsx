"use client";

import { Button } from "@heroui/react";
import { useTransition, type ReactNode } from "react";

import { NavigationPendingRegion } from "@/components/app-shell/navigation-pending";
import { FeedTimeline } from "@/components/feed/feed-timeline";
import { FeedToolbar } from "@/components/feed/feed-toolbar";
import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import { SkeletonFeedCard } from "@/components/ui/skeleton";
import { useClientSession } from "@/hooks/use-client-session";
import { usePagedList } from "@/hooks/use-paged-list";
import type { FeedDay, FeedPage } from "@/lib/community-types";
import type { FeedCursor, FeedView } from "@/lib/feed";
import { signInUrl } from "@/lib/sign-in-redirect";
import { fetchApi } from "@/spa/lib/api";
import { useRouter } from "@/spa/lib/navigation";

type FeedResultProps = { initialPage: FeedPage; view: FeedView; hasFriends: boolean };

export function FeedList({
  initialPage,
  view,
  hasFriends,
  viewerId,
  toolbar,
  pending = false,
  error,
  onRetry,
}: Omit<FeedResultProps, "initialPage"> & {
  initialPage?: FeedPage;
  viewerId: string;
  toolbar?: ReactNode;
  pending?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const session = useClientSession();
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
      <FeedToolbar
        refreshing={refreshing || pending}
        onRefresh={() => startRefresh(() => router.refresh())}
      >
        {toolbar}
      </FeedToolbar>
      <NavigationPendingRegion pending={pending} className="flex flex-col gap-4">
        {error && (
          <InlineAlert
            action={
              <Button size="sm" onPress={onRetry}>
                Retry
              </Button>
            }
          >
            Couldn’t load feed activity.
          </InlineAlert>
        )}
        {initialPage ? (
          <FeedResults key={view} initialPage={initialPage} view={view} hasFriends={hasFriends} />
        ) : error ? null : (
          <div
            role="status"
            aria-label="Loading feed"
            className="flex flex-col gap-4 max-md:min-h-svh"
          >
            <SkeletonFeedCard />
            <SkeletonFeedCard />
          </div>
        )}
      </NavigationPendingRegion>
    </div>
  );
}

function FeedResults({ initialPage, view, hasFriends }: FeedResultProps) {
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
      const page = await fetchApi("/api/feed", { query: params, signal, sessionEvents: true });
      return { items: page.days, hasMore: page.hasMore, meta: null };
    },
  });
  return (
    <>
      {" "}
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
    </>
  );
}
