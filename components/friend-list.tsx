"use client";

import { useRouter } from "next/navigation";

import { ClimberListItem } from "@/components/climber-list-item";
import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import type { FriendRow, FriendsPage } from "@/db/queries";
import { usePagedList } from "@/hooks/use-paged-list";
import { apiFetch } from "@/lib/api-client";
import { signInUrl } from "@/lib/sign-in-redirect";

export function FriendList({
  initialPage,
  requestsOnly,
}: {
  initialPage: FriendsPage;
  requestsOnly: boolean;
}) {
  const router = useRouter();
  const { items, hasMore, loadingMore, loadMoreFailed, loadMore } = usePagedList<FriendRow, null>({
    initialItems: initialPage.friends,
    initialHasMore: initialPage.hasMore,
    initialMeta: null,
    itemKey: (row) => row.id,
    mergeMeta: () => null,
    fetchPage: async (offset, _page, _last, signal) => {
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
          requestsOnly
            ? "No pending friend requests."
            : "No friends yet. Find your climbing partners or share your profile."
        }
        cta={<AppLink href="/?mode=climber">Find climbers</AppLink>}
      />
    );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-x-8 lg:grid-cols-2">
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
          return <ClimberListItem key={friend.id} climber={friend} detail={detail} />;
        })}
      </div>
      {hasMore && (
        <LoadMoreButton onPress={loadMore} loading={loadingMore} failed={loadMoreFailed} />
      )}
    </div>
  );
}
