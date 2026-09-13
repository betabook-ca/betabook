"use client";

import { useRouter } from "next/navigation";

import { ClimbListSortControl } from "@/components/climb-list-sort-control";
import { statsActiveFilters } from "@/components/filters/active-filter-values";
import { ClimbStatsFields } from "@/components/filters/climb-stats-filter-fields";
import { FilterInput } from "@/components/filters/filter-input";
import { FilterToolbar } from "@/components/filters/filter-toolbar";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import type { SubtreeClimbsSort } from "@/db/queries";
import { useFilterFormNavigation } from "@/hooks/use-filter-form-navigation";
import {
  areaClimbsFilterToSearchParams,
  DEFAULT_AREA_CLIMBS_FILTER,
  DEFAULT_AREA_CLIMBS_SORT,
  type AreaClimbsFilter,
} from "@/lib/filters/area-climbs-filter";

function buildClimbsHref(
  areaPath: string,
  sort: SubtreeClimbsSort,
  filter: AreaClimbsFilter,
): string {
  return `${areaPath}?${areaClimbsFilterToSearchParams(sort, filter).toString()}`;
}

/** Filters the climb list beneath it within the current area subtree. */
export function AreaClimbsToolbar({
  areaPath,
  sort,
  filter,
}: {
  areaPath: string;
  sort: SubtreeClimbsSort;
  filter: AreaClimbsFilter;
}) {
  const router = useRouter();
  const {
    name,
    setName,
    filter: value,
    setFilter: setValue,
    reset,
  } = useFilterFormNavigation({
    initialFilter: {
      disciplines: filter.disciplines,
      boulderRange: filter.boulderRange,
      sportRange: filter.sportRange,
      tradRange: filter.tradRange,
      ratingRange: filter.ratingRange,
      minAscents: filter.minAscents,
      subareaId: filter.subareaId,
    },
    initialName: filter.name ?? "",
    defaultFilter: DEFAULT_AREA_CLIMBS_FILTER,
    sort,
    defaultSort: DEFAULT_AREA_CLIMBS_SORT,
    buildHref: (value, name, _areaName, effectiveSort = sort) =>
      buildClimbsHref(areaPath, effectiveSort, { ...value, name }),
  });

  return (
    <FilterToolbar
      value={value}
      onChange={setValue}
      onReset={reset}
      activeFilters={[
        ...statsActiveFilters(value, setValue),
        ...(name.trim()
          ? [{ id: "query", label: `Text: ${name}`, onRemove: () => setName("") }]
          : []),
        ...(value.subareaId != null
          ? [
              {
                id: "subarea",
                label: "Selected subarea",
                onRemove: () => setValue({ ...value, subareaId: null }),
              },
            ]
          : []),
      ]}
      textFilter={
        <div className={FIELD_WIDTH_CLASS.long}>
          <FilterInput
            value={name}
            onChange={setName}
            label="Filter climbs in this area"
            placeholder="Filter climbs…"
          />
        </div>
      }
      sortControl={
        <ClimbListSortControl
          sort={sort}
          onNavigate={(nextSort) =>
            router.replace(buildClimbsHref(areaPath, nextSort, filter), { scroll: false })
          }
        />
      }
      extraFilters={
        <ClimbStatsFields
          ratingRange={value.ratingRange}
          onRatingRangeChange={(ratingRange) => setValue({ ...value, ratingRange })}
          minAscents={value.minAscents}
          onMinAscentsChange={(minAscents) => setValue({ ...value, minAscents })}
        />
      }
    />
  );
}
