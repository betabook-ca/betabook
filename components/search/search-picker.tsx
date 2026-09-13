"use client";

import type { ReactNode } from "react";

import { LoadMoreButton } from "@/components/ui/load-more-button";

import { SearchInput } from "./search-input";
import { SearchResults } from "./search-results";
import type { SearchResult, SearchSection } from "./search-types";

export function SearchPicker({
  query,
  onQueryChange,
  section,
  onPick,
  onRetry,
  filters,
  selectedId,
  onLoadMore,
  loadingMore = false,
  loadMoreFailed = false,
  autoFocus = false,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  section: SearchSection;
  onPick: (item: SearchResult) => void;
  onRetry: () => void;
  filters?: ReactNode;
  selectedId?: string;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  loadMoreFailed?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SearchInput
        label="Choose a climb"
        placeholder="Search climbs…"
        value={query}
        onChange={onQueryChange}
        inputProps={{ autoFocus }}
      />
      {filters}
      {section.status !== "idle" && (
        <SearchResults
          sections={[section]}
          onSelect={onPick}
          onRetry={onRetry}
          selectedId={selectedId}
          picking
        />
      )}
      {section.hasMore && onLoadMore && (
        <LoadMoreButton onPress={onLoadMore} loading={loadingMore} failed={loadMoreFailed} />
      )}
    </div>
  );
}
