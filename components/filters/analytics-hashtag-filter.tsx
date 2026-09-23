"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { hashtagActiveFilters } from "@/components/filters/active-filter-values";
import { FilterToolbarLayout } from "@/components/filters/filter-toolbar";
import { HashtagFilter } from "@/components/filters/hashtag-filter";
import { useFilterFormNavigation } from "@/hooks/use-filter-form-navigation";
import { normalizeHashtagFilters } from "@/lib/filters/hashtag-filter";

export function AnalyticsHashtagFilter({
  selectedTags,
  tags,
  controls,
}: {
  controls?: ReactNode;
  selectedTags: string[];
  tags: string[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { filter, setFilter } = useFilterFormNavigation({
    initialFilter: selectedTags,
    defaultFilter: [],
    buildHref: (value) => {
      const query = new URLSearchParams(searchParams);
      query.delete("tag");
      for (const tag of normalizeHashtagFilters(value)) query.append("tag", tag);
      return `${pathname}?${query}`;
    },
  });
  return (
    <FilterToolbarLayout
      controls={controls}
      triggerClassName="h-9"
      activeFilters={hashtagActiveFilters(filter, setFilter)}
      onReset={() => setFilter([])}
      filters={<HashtagFilter value={filter} onChange={setFilter} tags={tags} />}
    />
  );
}
