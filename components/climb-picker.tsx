"use client";
import { Button } from "@heroui/react";
import { useState, type ComponentProps } from "react";

import { ClimbFilterControls } from "@/components/filters/climb-filter-controls";
import { DisciplineChips } from "@/components/filters/discipline-chips";
import { SearchPicker } from "@/components/search/search-picker";
import { AppLink } from "@/components/ui/app-link";
import type { ClimbWithAreaName } from "@/db/queries";
import { useSearch } from "@/hooks/use-search";
import {
  EMPTY_SEARCH,
  type ClimbSelectionContext,
  type SearchFetcher,
  type SearchState,
} from "@/lib/search";

/** Logging permits repeats; merge selection excludes the source climb by identity. */
export function ClimbPicker({
  onPick,
  sentClimbIds,
  allowSentClimbs = false,
  initialName = "",
  initialAreaName = "",
  excludedClimbId,
  fetcher,
  areaFetcher,
  showAreaLookup = false,
  showFilters = true,
  onCreateClimb,
}: {
  onCreateClimb?: (href: string) => void;
  areaFetcher?: ComponentProps<typeof ClimbFilterControls>["areaFetcher"];
  showAreaLookup?: boolean;
  showFilters?: boolean;
  onPick: (climb: ClimbWithAreaName, context: ClimbSelectionContext) => void;
  sentClimbIds?: Set<number>;
  allowSentClimbs?: boolean;
  initialName?: string;
  initialAreaName?: string;
  excludedClimbId?: number;
  fetcher?: SearchFetcher;
}) {
  const [state, setState] = useState<SearchState>({
    ...EMPTY_SEARCH,
    category: "climb",
    query: initialName,
  });
  const search = useSearch({ state, fetcher });
  const source = search.sections[0];
  const section = {
    ...source,
    items: source.items.map((item) => ({
      ...item,
      disabledReason:
        item.climb?.id === excludedClimbId
          ? "This is the source climb"
          : !allowSentClimbs &&
              (item.context?.sent || (item.climb && sentClimbIds?.has(item.climb.id)))
            ? "Already logged"
            : undefined,
    })),
  };
  const newParams = new URLSearchParams({ name: state.query });
  if (state.area) {
    newParams.set("areaId", state.area.id);
    newParams.set("areaName", state.area.name);
  }
  if (state.filter.disciplines.length === 1) newParams.set("type", state.filter.disciplines[0]);
  return (
    <div className="flex flex-col gap-4">
      <SearchPicker
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows the drawer step into its climb search
        autoFocus
        query={state.query}
        onQueryChange={(query) => setState({ ...state, query })}
        section={section}
        onRetry={() => search.retry("climb")}
        onLoadMore={search.loadMore}
        loadingMore={search.loadingMore}
        loadMoreFailed={search.loadMoreFailed}
        filters={
          showFilters ? (
            <ClimbFilterControls
              showMinAscents={false}
              showAreaLookup={showAreaLookup}
              areaFetcher={areaFetcher}
              value={state}
              onChange={(next) => setState({ ...state, ...next })}
              initialAreaQuery={initialAreaName}
            />
          ) : (
            <DisciplineChips
              single
              value={state.filter.disciplines}
              onChange={(disciplines) =>
                setState({ ...state, filter: { ...state.filter, disciplines } })
              }
            />
          )
        }
        onPick={(result) => {
          const item = section.items.find((candidate) => candidate.id === result.id);
          if (section.status === "ready" && item?.climb && item.context && !item.disabledReason)
            onPick(item.climb, {
              ...item.context,
              sent: item.context.sent || (sentClimbIds?.has(item.climb.id) ?? false),
            });
        }}
      />
      {showAreaLookup && initialAreaName && !state.area && (
        <p className="text-xs text-muted">
          Choose an area above to narrow the imported location “{initialAreaName}”.
        </p>
      )}
      {section.status === "ready" &&
        section.items.length === 0 &&
        (onCreateClimb ? (
          <Button variant="ghost" onPress={() => onCreateClimb(`/climbs/new?${newParams}`)}>
            Add the climb
          </Button>
        ) : (
          <AppLink href={`/climbs/new?${newParams}`}>Add the climb</AppLink>
        ))}
    </div>
  );
}
