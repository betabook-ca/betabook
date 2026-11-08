"use client";

import { usePathname, useRouter } from "next/navigation";

import { ClimbFilterControls } from "@/components/filters/climb-filter-controls";
import { FilterInput } from "@/components/filters/filter-input";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { SortSelect } from "@/components/ui/sort-select";
import { useFilterFormNavigation } from "@/hooks/use-filter-form-navigation";
import { DEFAULT_CLIMB_LIST_SORT as DEFAULT_CATALOG_SORT } from "@/lib/climb-list-sort";
import {
  CLIMB_LIST_SORT_DIRECTION,
  CLIMB_LIST_SORT_OPTIONS,
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
    buildHref: (next, nextName) =>
      hrefFor(view.sort, nextName ? { ...next.filter, name: nextName } : next.filter),
  });

  return (
    <ClimbFilterControls
      value={state}
      onChange={setState}
      onReset={reset}
      showExcludeSent={signedIn}
      activeFilters={
        name.trim() ? [{ id: "query", label: `Text: ${name}`, onRemove: () => setName("") }] : []
      }
      textFilter={
        <div className={FIELD_WIDTH_CLASS.long}>
          <FilterInput
            value={name}
            onChange={setName}
            label="Filter climbs on this list"
            placeholder="Filter climbs…"
          />
        </div>
      }
      sortControl={
        <SortSelect
          sort={view.sort}
          fields={CLIMB_LIST_SORT_OPTIONS}
          defaultField="position"
          defaultDirection={CLIMB_LIST_SORT_DIRECTION}
          onNavigate={(sort: ClimbListSort) =>
            router.replace(hrefFor(sort, view.filter), { scroll: false })
          }
        />
      }
    />
  );
}
