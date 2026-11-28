import { Button } from "@heroui/react";

import { NavigationPendingRegion } from "@/components/app-shell/navigation-pending";
import { FriendList } from "@/components/friends/friend-list";
import { FriendSuggestions } from "@/components/friends/friend-suggestions";
import { FriendTabs } from "@/components/friends/friend-tabs";
import { FriendsSearch } from "@/components/friends/friends-search";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SkeletonListRows } from "@/components/ui/skeleton";
import type { FriendsPage, SuggestedClimberRow } from "@/lib/community-types";
import type { FriendsView } from "@/lib/friendships";
import type { SearchFetcher } from "@/lib/search";

/** Shared page composition: stories replace only data and search transport. */
export function FriendsContent({
  userId,
  view,
  page,
  suggestions,
  fetcher,
  resultsView = view,
  pending = false,
  error,
  onRetry,
}: {
  userId: string;
  view: FriendsView;
  page?: FriendsPage;
  resultsView?: FriendsView;
  pending?: boolean;
  error?: boolean;
  onRetry?: () => void;
  suggestions: SuggestedClimberRow[] | null;
  fetcher?: SearchFetcher;
}) {
  const requestsOnly = resultsView === "requests";
  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Friends" className="flex w-full min-w-0 flex-col gap-5">
        <FriendTabs view={view} userId={userId} />
        <p className="max-w-3xl text-sm text-muted">
          Only you can see your friend list. Your friends may be suggested to one another. You can
          remove a friend at any time.
        </p>
        <NavigationPendingRegion pending={pending}>
          {error && (
            <InlineAlert
              action={
                <Button size="sm" onPress={onRetry}>
                  Retry
                </Button>
              }
            >
              Couldn’t load friends.
            </InlineAlert>
          )}
          {!page ? (
            error ? null : (
              <SkeletonListRows rows={6} />
            )
          ) : requestsOnly ? (
            <FriendList key={`${userId}:requests`} initialPage={page} requestsOnly />
          ) : (
            <FriendsSearch fetcher={fetcher}>
              <div className="flex flex-col gap-6">
                <FriendList key={`${userId}:friends`} initialPage={page} requestsOnly={false} />
                {suggestions && suggestions.length > 0 && (
                  <FriendSuggestions climbers={suggestions} />
                )}
              </div>
            </FriendsSearch>
          )}
        </NavigationPendingRegion>
      </section>
    </div>
  );
}
