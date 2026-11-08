"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { ClimbFilterControls } from "@/components/filters/climb-filter-controls";
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
import { DEFAULT_CLIMB_FILTER } from "@/lib/filters/climb-filter";
import type { ClimbFilterState } from "@/lib/filters/climb-filter-state";

/**
 * The discipline chips and Filters panel from Find climbs, over one list:
 * disciplines and grades, rating, ascents and, for a signed-in reader,
 * Exclude sent. No text box or area lookup: a list is short enough to scan.
 * The list keeps its own sort (circuit, grade, area, name, date added).
 * Everything lives in the URL and none of it changes the list.
 */
export function ClimbListToolbar({
  view,
  signedIn,
  menu,
}: {
  view: ClimbListView;
  signedIn: boolean;
  /** Beside the sort, such as the owner's ⋯ menu with Reorder. */
  menu?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const hrefFor = (sort: ClimbListSort, state: ClimbFilterState) =>
    `${pathname}${climbListViewSearch({ sort, filter: state.filter })}`;

  const initial: ClimbFilterState = { filter: view.filter, area: null, sort: DEFAULT_CATALOG_SORT };
  const {
    filter: state,
    setFilter: setState,
    reset,
  } = useFilterFormNavigation({
    initialFilter: initial,
    defaultFilter: { filter: DEFAULT_CLIMB_FILTER, area: null, sort: DEFAULT_CATALOG_SORT },
    buildHref: (next) => hrefFor(view.sort, next),
  });

  return (
    <ClimbFilterControls
      value={state}
      onChange={setState}
      onReset={reset}
      showExcludeSent={signedIn}
      sortControl={
        <div className="flex items-center gap-1">
          <SortSelect
            sort={view.sort}
            fields={CLIMB_LIST_SORT_OPTIONS}
            defaultField="position"
            defaultDirection={CLIMB_LIST_SORT_DIRECTION}
            onNavigate={(sort: ClimbListSort) =>
              router.replace(hrefFor(sort, initial), { scroll: false })
            }
          />
          {menu}
        </div>
      }
    />
  );
}
