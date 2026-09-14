"use client";

import { useState, type ReactNode } from "react";

import { ClimberListItem } from "@/components/climber-list-item";
import { SearchInput } from "@/components/search/search-input";
import { SearchResults } from "@/components/search/search-results";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import { SectionHeading } from "@/components/ui/typography";
import { useSearch } from "@/hooks/use-search";
import { EMPTY_SEARCH, type SearchFetcher } from "@/lib/search";

export function FriendsSearch({
  fetcher,
  children,
}: {
  fetcher?: SearchFetcher;
  children?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const search = useSearch({ state: { ...EMPTY_SEARCH, category: "climber", query }, fetcher });
  const section = search.sections[0];
  const searching = query.trim().length > 0;
  return (
    <section aria-label="People" className="flex min-w-0 flex-col gap-4">
      <SearchInput
        label="Find climbers"
        placeholder="Find climbers…"
        value={query}
        onChange={setQuery}
      />
      <div hidden={searching}>{children}</div>
      {searching && (
        <div aria-busy={section.status === "loading"}>
          {section.status === "ready" && section.items.length > 0 ? (
            <div className="flex flex-col gap-5">
              {[true, false].map((friends) => {
                const items = section.items.filter(
                  (item) =>
                    item.climber && (item.climber.friendshipStatus === "friends") === friends,
                );
                return (
                  items.length > 0 && (
                    <section
                      key={String(friends)}
                      aria-label={friends ? "Your friends" : "Other climbers"}
                    >
                      <SectionHeading>{friends ? "Your friends" : "Other climbers"}</SectionHeading>
                      <div className="grid gap-x-8 lg:grid-cols-2">
                        {items.map(
                          (item) =>
                            item.climber && (
                              <ClimberListItem compact key={item.id} climber={item.climber} />
                            ),
                        )}
                      </div>
                    </section>
                  )
                );
              })}
            </div>
          ) : (
            <SearchResults
              sections={[{ ...section, items: [] }]}
              onRetry={search.retry}
              onSelect={() => {}}
            />
          )}
        </div>
      )}
      {section.hasMore && searching && (
        <LoadMoreButton
          onPress={search.loadMore}
          loading={search.loadingMore}
          failed={search.loadMoreFailed}
        />
      )}
    </section>
  );
}
