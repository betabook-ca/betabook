import type { ActiveFilter } from "@/components/filters/active-filter-summary";
import { DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { MAX_RATING } from "@/lib/filters/climb-stats-filter";
import type { DateFilterValue, RelativeDatePreset } from "@/lib/filters/date-filter";
import { DEFAULT_DISCIPLINE_FILTER, type DisciplineFilter } from "@/lib/filters/discipline-filter";
import { formatDate } from "@/lib/format-date";
import { nativeGradeArray } from "@/lib/grades";

export function disciplineActiveFilters<T extends DisciplineFilter>(
  value: T,
  onChange: (value: T) => void,
): ActiveFilter[] {
  return value.disciplines.flatMap((discipline) => {
    const key = `${discipline}Range` as const;
    const range = value[key];
    const defaults = DEFAULT_DISCIPLINE_FILTER[key];
    const grades = nativeGradeArray(discipline);
    const filters: ActiveFilter[] = [
      {
        id: discipline,
        label: DISCIPLINE_LABELS[discipline],
        onRemove: () =>
          onChange({ ...value, disciplines: value.disciplines.filter((d) => d !== discipline) }),
      },
    ];
    if (range[0] !== defaults[0] || range[1] !== defaults[1])
      filters.push({
        id: key,
        label: `${DISCIPLINE_LABELS[discipline]} grades: ${grades[range[0]]}–${grades[range[1]]}`,
        onRemove: () => onChange({ ...value, [key]: defaults }),
      });
    return filters;
  });
}

export const DATE_PRESET_LABELS: Record<RelativeDatePreset, string> = {
  "this-month": "This month",
  "this-year": "This year",
  "last-year": "Last year",
};

/** 0 on either side means unbounded. */
export function ratingBounds(range: [number, number]): [number, number] {
  return [range[0] || 1, range[1] || MAX_RATING];
}

export function dateActiveFilters<T extends DateFilterValue>(
  value: T,
  onChange: (value: T) => void,
): ActiveFilter[] {
  if (!value.date && !value.dateFrom && !value.dateTo) return [];
  const day = (date: string | undefined) => (date ? formatDate(date) : "Any time");
  const label = value.datePreset
    ? DATE_PRESET_LABELS[value.datePreset]
    : value.date
      ? formatDate(value.date)
      : `${day(value.dateFrom)} – ${day(value.dateTo)}`;
  return [
    {
      id: "dates",
      label: `Dates: ${label}`,
      onRemove: () =>
        onChange({
          ...value,
          date: undefined,
          dateFrom: undefined,
          dateTo: undefined,
          datePreset: undefined,
        }),
    },
  ];
}

export function hashtagActiveFilters(
  tags: string[],
  onChange: (tags: string[]) => void,
): ActiveFilter[] {
  return tags.map((tag) => ({
    id: `tag-${tag}`,
    label: `#${tag}`,
    onRemove: () => onChange(tags.filter((t) => t !== tag)),
  }));
}

export function ratingActiveFilters(
  range: [number, number],
  onChange: (range: [number, number]) => void,
): ActiveFilter[] {
  const [min, max] = ratingBounds(range);
  if (min === 1 && max === MAX_RATING) return [];
  return [
    {
      id: "rating",
      label: `Rating: ${min === max ? min : `${min}–${max}`} ${min === max && min === 1 ? "star" : "stars"}`,
      ratingRange: [min, max],
      onRemove: () => onChange([1, MAX_RATING]),
    },
  ];
}

export function statsActiveFilters<T extends { ratingRange: [number, number]; minAscents: number }>(
  value: T,
  onChange: (value: T) => void,
): ActiveFilter[] {
  return [
    ...ratingActiveFilters(value.ratingRange, (ratingRange) => onChange({ ...value, ratingRange })),
    ...(value.minAscents > 0
      ? [
          {
            id: "min-ascents",
            label: `Min ascents: ${value.minAscents}`,
            onRemove: () => onChange({ ...value, minAscents: 0 }),
          },
        ]
      : []),
  ];
}
