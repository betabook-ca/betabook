"use client";

import { useRouter } from "next/navigation";

import { ClimberListItem } from "@/components/climber-list-item";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import { SectionHeading } from "@/components/ui/typography";
import type { FriendRow, FriendsPage } from "@/db/queries";
import { usePagedList } from "@/hooks/use-paged-list";
import { apiFetch } from "@/lib/api-client";
import { signInUrl } from "@/lib/sign-in-redirect";

export function FriendList({
  initialPage,
  requestsOnly,
  fetchPage,
}: {
  initialPage: FriendsPage;
  requestsOnly: boolean;
  fetchPage?: (offset: number, signal: AbortSignal) => Promise<FriendsPage>;
}) {
  const router = useRouter();
  const { items, hasMore, loadingMore, loadMoreFailed, loadMore } = usePagedList<FriendRow, null>({
    initialItems: initialPage.friends,
    initialHasMore: initialPage.hasMore,
    initialMeta: null,
    itemKey: (row) => row.id,
    mergeMeta: () => null,
    fetchPage: async (offset, _page, _last, signal) => {
      if (fetchPage) {
        const page = await fetchPage(offset, signal);
        return { items: page.friends, hasMore: page.hasMore, meta: null };
      }
      const response = await apiFetch(
        `/api/friends?offset=${offset}&view=${requestsOnly ? "requests" : "all"}`,
        { cache: "no-store", signal },
      );
      if (response.status === 401) router.replace(signInUrl("/friends"));
      if (!response.ok) throw new Error("Couldn't load friends");
      const page = (await response.json()) as FriendsPage;
      return { items: page.friends, hasMore: page.hasMore, meta: null };
    },
  });
  if (!items.length)
    return (
      <EmptyState
        message={
          requestsOnly ? "No pending friend requests." : "No friends yet. Search for someone above."
        }
      />
    );
  return (
    <div className="flex flex-col gap-4">
      {/* Keeps the climber h3s from following the page's h1 directly. */}
      <SectionHeading className="sr-only">
        {requestsOnly ? "Friend requests" : "Friends"}
      </SectionHeading>
      {!requestsOnly && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-muted">
          <p role="status" aria-label="Friend count">
            {hasMore ? `Showing ${items.length}` : `All ${items.length}`}{" "}
            {items.length === 1 ? "friend" : "friends"}
            {!hasMore && " shown"}
          </p>
          {hasMore && <p>10 at a time · Load more below</p>}
        </div>
      )}
      <ul role="list" className="grid gap-x-8 lg:grid-cols-2">
        {items.map((friend) => {
          const detail = [
            friend.friendshipStatus === "incoming"
              ? "Wants to be friends"
              : friend.friendshipStatus === "outgoing"
                ? "Waiting for a reply"
                : null,
            friend.isPrivate ? "Private profile" : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            // The item is the grid cell: min-w-0 lets long names shrink instead of overflowing.
            <li key={friend.id} className="min-w-0">
              <ClimberListItem compact climber={friend} detail={detail} />
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <LoadMoreButton onPress={loadMore} loading={loadingMore} failed={loadMoreFailed} />
      )}
    </div>
  );
}
