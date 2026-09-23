"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

import { ASCENT_STYLE_CHIP_CLASSNAME, ASCENT_STYLE_LABELS } from "@/components/ascent-style";
import {
  dateActiveFilters,
  hashtagActiveFilters,
  ratingActiveFilters,
} from "@/components/filters/active-filter-values";
import { DateFilter } from "@/components/filters/date-filter";
import { FilterInput } from "@/components/filters/filter-input";
import { FilterToolbar } from "@/components/filters/filter-toolbar";
import { HashtagFilter } from "@/components/filters/hashtag-filter";
import { RatingRangeFilter } from "@/components/filters/min-rating-filter";
import { AreaLookup } from "@/components/search/area-lookup";
import { choicePillClass } from "@/components/ui/choice-pill";
import {
  FIELD_WIDTH_CLASS,
  FILTER_ROW_CLASS,
  FILTER_LABEL_CLASS,
  FILTER_CONTROL_CLASS,
} from "@/components/ui/field";
import { SortSelect } from "@/components/ui/sort-select";
import type { UserSendsFilter } from "@/db/queries";
import { useFilterFormNavigation } from "@/hooks/use-filter-form-navigation";
import {
  DEFAULT_USER_SENDS_FILTER,
  DEFAULT_USER_SENDS_SORT,
  userSendsFilterToSearchParams,
} from "@/lib/filters/user-sends-filter";
import { ASCENT_STYLES, type AscentStyle as AscentStyleType } from "@/lib/sends";

const EMPTY_TAGS: string[] = [];

function AscentStyleFields({
  value,
  onChange,
}: {
  value: AscentStyleType[];
  onChange: (value: AscentStyleType[]) => void;
}) {
  return (
    <div className={FILTER_ROW_CLASS}>
      <span className={FILTER_LABEL_CLASS}>Ascent style</span>
      <div
        className={`${FILTER_CONTROL_CLASS} flex flex-wrap items-center gap-1.5`}
        role="group"
        aria-label="Ascent style"
      >
        {ASCENT_STYLES.map((style) => (
          <button
            key={style}
            type="button"
            aria-pressed={value.includes(style)}
            className={choicePillClass(value.includes(style), ASCENT_STYLE_CHIP_CLASSNAME[style])}
            onClick={() =>
              onChange(value.includes(style) ? value.filter((s) => s !== style) : [...value, style])
            }
          >
            {ASCENT_STYLE_LABELS[style]}
          </button>
        ))}
      </div>
    </div>
  );
}

type SortField = "date" | "grade" | "rating";

const SORT_FIELDS: { id: SortField; label: string }[] = [
  { id: "date", label: "Date" },
  { id: "grade", label: "Grade" },
  { id: "rating", label: "Rating" },
];

const DEFAULT_DIRECTION: Record<SortField, "asc" | "desc"> = {
  date: "desc",
  grade: "desc",
  rating: "desc",
};

/** Do not key the toolbar by filters: remounting loses input focus when a
 * debounced navigation lands. The hook adopts external URL changes in place. */
export function UserSendsFilterToolbar({
  filter,
  basePath,
  tags = EMPTY_TAGS,
  areaFetcher,
  lockedDateRange = false,
}: {
  areaFetcher?: ComponentProps<typeof AreaLookup>["fetcher"];
  tags?: string[];
  filter: UserSendsFilter;
  basePath: string;
  /** Hides the date control and its removable chip. The dates are not a filter
   * the reader chose — they are the trip they are looking at — so offering a
   * way to clear them would let the climber empty a trip from inside it. The
   * page re-pins the window server-side regardless; this keeps the UI honest
   * about what can be changed. */
  lockedDateRange?: boolean;
}) {
  const router = useRouter();
  const {
    name,
    setName,
    areaName,
    setAreaName,
    filter: disciplineFilter,
    setFilter: setDisciplineFilter,
    reset,
  } = useFilterFormNavigation({
    initialFilter: {
      tags: filter.tags,
      date: filter.date,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
      datePreset: filter.datePreset,
      areaId: filter.areaId,
      disciplines: filter.disciplines,
      boulderRange: filter.boulderRange,
      sportRange: filter.sportRange,
      tradRange: filter.tradRange,
      ascentStyles: filter.ascentStyles,
      minRating: filter.minRating,
      maxRating: filter.maxRating,
    },
    initialName: filter.name ?? "",
    initialAreaName: filter.areaName ?? "",
    defaultFilter: DEFAULT_USER_SENDS_FILTER,
    sort: filter.sort,
    defaultSort: DEFAULT_USER_SENDS_SORT,
    buildHref: (disciplineFilter, name, areaName, sort) =>
      `${basePath}?${userSendsFilterToSearchParams({ ...disciplineFilter, name, areaName, sort }).toString()}`,
  });

  return (
    <FilterToolbar
      value={disciplineFilter}
      onChange={setDisciplineFilter}
      onReset={reset}
      activeFilters={[
        ...(lockedDateRange ? [] : dateActiveFilters(disciplineFilter, setDisciplineFilter)),
        ...hashtagActiveFilters(disciplineFilter.tags ?? EMPTY_TAGS, (tags) =>
          setDisciplineFilter({ ...disciplineFilter, tags }),
        ),
        ...ratingActiveFilters(
          [disciplineFilter.minRating, disciplineFilter.maxRating],
          ([minRating, maxRating]) =>
            setDisciplineFilter({ ...disciplineFilter, minRating, maxRating }),
        ),
        ...disciplineFilter.ascentStyles.map((style) => ({
          id: `ascent-${style}`,
          label: ASCENT_STYLE_LABELS[style],
          onRemove: () =>
            setDisciplineFilter({
              ...disciplineFilter,
              ascentStyles: disciplineFilter.ascentStyles.filter((s) => s !== style),
            }),
        })),
        ...(name.trim()
          ? [{ id: "query", label: `Text: ${name}`, onRemove: () => setName("") }]
          : []),
        ...(areaName || disciplineFilter.areaId !== undefined
          ? [
              {
                id: "area",
                label: `Area: ${areaName || "Selected area"}`,
                onRemove: () => {
                  setAreaName("");
                  setDisciplineFilter({ ...disciplineFilter, areaId: undefined });
                },
              },
            ]
          : []),
      ]}
      textFilter={
        <div className={FIELD_WIDTH_CLASS.long}>
          <FilterInput
            value={name}
            onChange={setName}
            label="Filter sends"
            placeholder="Filter sends…"
          />
        </div>
      }
      sortControl={
        <SortSelect
          sort={filter.sort ?? DEFAULT_USER_SENDS_SORT}
          fields={SORT_FIELDS}
          defaultField="date"
          defaultDirection={DEFAULT_DIRECTION}
          onNavigate={(nextSort) => {
            const params = userSendsFilterToSearchParams({ ...filter, sort: nextSort });
            router.replace(`${basePath}?${params.toString()}`, { scroll: false });
          }}
        />
      }
      extraFilters={
        <>
          <div className={FILTER_ROW_CLASS}>
            <span className={FILTER_LABEL_CLASS}>Area</span>
            <div className={FIELD_WIDTH_CLASS.long}>
              <AreaLookup
                fetcher={areaFetcher}
                label="Filter by area"
                hideLabel
                placeholder="Filter by area…"
                value={
                  disciplineFilter.areaId === undefined
                    ? null
                    : {
                        id: String(disciplineFilter.areaId),
                        name: areaName || "Selected area",
                        path: "",
                      }
                }
                onChange={(area) => {
                  setAreaName(area?.name ?? "");
                  setDisciplineFilter({
                    ...disciplineFilter,
                    areaId: area ? Number(area.id) : undefined,
                  });
                }}
              />
            </div>
          </div>
          <HashtagFilter
            inlineLabel
            value={disciplineFilter.tags ?? EMPTY_TAGS}
            tags={tags}
            onChange={(tags) => setDisciplineFilter({ ...disciplineFilter, tags })}
          />
          {!lockedDateRange && (
            <DateFilter
              value={disciplineFilter}
              onChange={(dates) => setDisciplineFilter({ ...disciplineFilter, ...dates })}
            />
          )}
          <AscentStyleFields
            value={disciplineFilter.ascentStyles}
            onChange={(ascentStyles) => setDisciplineFilter({ ...disciplineFilter, ascentStyles })}
          />
          <RatingRangeFilter
            value={[disciplineFilter.minRating, disciplineFilter.maxRating]}
            onChange={([minRating, maxRating]) =>
              setDisciplineFilter({ ...disciplineFilter, minRating, maxRating })
            }
          />
        </>
      }
    />
  );
}
