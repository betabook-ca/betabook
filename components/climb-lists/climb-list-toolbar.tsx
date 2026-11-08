"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { textActiveFilters } from "@/components/filters/active-filter-values";
import { ClimbFilterControls } from "@/components/filters/climb-filter-controls";
import { TextFilterField } from "@/components/filters/filter-input";
import { SortSelect } from "@/components/ui/sort-select";
import { useFilterFormNavigation } from "@/hooks/use-filter-form-navigation";
import { DEFAULT_CLIMB_LIST_SORT as DEFAULT_CATALOG_SORT } from "@/lib/climb-list-sort";
import {
  CLIMB_LIST_SORT_DIRECTION,
  CLIMB_LIST_SORT_OPTIONS,
  DEFAULT_CLIMB_LIST_SORT,
  climbListViewSearch,
  type ClimbListSort,
  type ClimbListView,
} from "@/lib/climb-lists";
import { DEFAULT_CLIMB_FILTER, type ClimbFilter } from "@/lib/filters/climb-filter";
import type { ClimbFilterState } from "@/lib/filters/climb-filter-state";

/**
 * A text box on the climb name, and the discipline chips and Filters panel
 * from Find climbs, over one list: disciplines and grades, rating, ascents
 * and, for a signed-in reader, Exclude sent. No area lookup: a list's climbs
 * are already chosen. The list keeps its own sort (circuit, grade, area,
 * name, date added). Everything lives in the URL and none of it changes the
 * list.
 */
export function ClimbListToolbar({ view, signedIn }: { view: ClimbListView; signedIn: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const hrefFor = (sort: ClimbListSort, filter: ClimbFilter) =>
    `${pathname}${climbListViewSearch({ sort, filter })}`;

  // A sort the reader just chose, until the URL catches up. The text box's
  // debounced navigation builds on it, so it can't land after the sort's own
  // navigation and write the old sort back. Any change to the URL's sort
  // (this one landing, or Back) drops it.
  const [pendingSort, setPendingSort] = useState<ClimbListSort | null>(null);
  const [seenSort, setSeenSort] = useState(view.sort);
  if (seenSort !== view.sort) {
    setSeenSort(view.sort);
    setPendingSort(null);
  }
  const sort = pendingSort ?? view.sort;

  // The text box keeps its own state, so typing stays responsive while the
  // URL catches up; the rest of the filter rides in `filter`.
  const { name: committedName = "", ...rest } = view.filter;
  const initial: ClimbFilterState = { filter: rest, area: null, sort: DEFAULT_CATALOG_SORT };
  const {
    name,
    setName,
    filter: state,
    setFilter: setState,
    reset,
  } = useFilterFormNavigation({
    initialFilter: initial,
    initialName: committedName,
    defaultFilter: { filter: DEFAULT_CLIMB_FILTER, area: null, sort: DEFAULT_CATALOG_SORT },
    // Given the sort, the hook keeps typed text across a sort change and never
    // writes a stale sort back. No defaultSort: Clear all keeps the list's
    // sort. Without one the hook compares filters at a fixed sort (the
    // fallback below), so a sort change alone isn't an outside filter change.
    sort,
    buildHref: (next, nextName, _areaName, effectiveSort = DEFAULT_CLIMB_LIST_SORT) => {
      // Matches how the page parses it, so the URL the box writes is the one
      // it reads back; a name of only spaces is no name.
      const trimmed = nextName.trim();
      return hrefFor(effectiveSort, trimmed ? { ...next.filter, name: trimmed } : next.filter);
    },
  });

  return (
    <ClimbFilterControls
      value={state}
      onChange={setState}
      onReset={reset}
      showExcludeSent={signedIn}
      activeFilters={textActiveFilters(name, () => setName(""))}
      textFilter={
        <TextFilterField
          value={name}
          onChange={setName}
          label="Filter climbs on this list"
          placeholder="Filter climbs…"
        />
      }
      sortControl={
        <SortSelect
          sort={sort}
          fields={CLIMB_LIST_SORT_OPTIONS}
          defaultField="position"
          defaultDirection={CLIMB_LIST_SORT_DIRECTION}
          onNavigate={(next: ClimbListSort) => {
            setPendingSort(next);
            // Only what the URL already holds: text still being typed follows
            // in the box's own navigation, so arriving here can't reseed it.
            router.replace(hrefFor(next, view.filter), { scroll: false });
          }}
        />
      }
    />
  );
}
