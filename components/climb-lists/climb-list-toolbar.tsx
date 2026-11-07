"use client";

import { usePathname, useRouter } from "next/navigation";

import { ClimbFilterControls } from "@/components/filters/climb-filter-controls";
import { FilterInput } from "@/components/filters/filter-input";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { SortSelect } from "@/components/ui/sort-select";
import { useFilterFormNavigation } from "@/hooks/use-filter-form-navigation";
import type { AreaSelection } from "@/lib/area-selection";
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
 * Find climbs' filters over one list: text, area, disciplines and grades,
 * rating, ascents and, for a signed-in reader, Exclude sent. The list keeps
 * its own sort (list order, grade, area, name, date added) in place of the
 * catalog's. Everything lives in the URL and none of it changes the list.
 */
export function ClimbListToolbar({
  view,
  area,
  signedIn,
}: {
  view: ClimbListView;
  /** The selected area's name and trail, resolved on the server. */
  area: AreaSelection | null;
  signedIn: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const hrefFor = (sort: ClimbListSort, state: ClimbFilterState, name: string) =>
    `${pathname}${climbListViewSearch({ sort, filter: { ...state.filter, name: name || undefined } })}`;

  const initial: ClimbFilterState = { filter: view.filter, area, sort: DEFAULT_CATALOG_SORT };
  const {
    name,
    setName,
    filter: state,
    setFilter: setState,
    reset,
  } = useFilterFormNavigation({
    initialFilter: initial,
    initialName: view.filter.name ?? "",
    defaultFilter: { filter: DEFAULT_CLIMB_FILTER, area: null, sort: DEFAULT_CATALOG_SORT },
    buildHref: (next, nextName) => hrefFor(view.sort, next, nextName),
  });

  return (
    <ClimbFilterControls
      value={state}
      onChange={setState}
      onReset={reset}
      showAreaLookup
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
            router.replace(hrefFor(sort, initial, view.filter.name ?? ""), { scroll: false })
          }
        />
      }
    />
  );
}
