import { FriendList } from "@/components/friend-list";
import { FriendSuggestions } from "@/components/friend-suggestions";
import { FriendTabs } from "@/components/friend-tabs";
import { FriendsSearch } from "@/components/friends-search";
import { PageTitle } from "@/components/ui/typography";
import type { FriendsPage, SuggestedClimberRow } from "@/db/queries";
import type { SearchFetcher } from "@/lib/search";

/** Shared page composition: stories replace only data and search transport. */
export function FriendsContent({
  userId,
  view,
  page,
  suggestions,
  fetcher,
  embedded = false,
}: {
  userId: string;
  view: "friends" | "requests";
  page: FriendsPage;
  suggestions: SuggestedClimberRow[] | null;
  fetcher?: SearchFetcher;
  embedded?: boolean;
}) {
  const requestsOnly = view === "requests";
  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Friends" className="flex w-full min-w-0 flex-col gap-5">
        {!embedded && <PageTitle>Friends</PageTitle>}
        <FriendTabs view={view} userId={userId} />
        <p className="max-w-3xl text-sm text-muted">
          Only you can see your friend list. Your friends may be suggested to one another. You can
          remove a friend at any time.
        </p>
        {requestsOnly ? (
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
      </section>
    </div>
  );
}
