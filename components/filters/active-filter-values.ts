import type { ActiveFilter } from "@/components/filters/active-filter-summary";
import { DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import type { DateFilterValue } from "@/lib/filters/date-filter";
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

export function dateActiveFilters<T extends DateFilterValue>(
  value: T,
  onChange: (value: T) => void,
): ActiveFilter[] {
  if (!value.date && !value.dateFrom && !value.dateTo) return [];
  const presets = {
    "this-month": "This month",
    "this-year": "This year",
    "last-year": "Last year",
  };
  const day = (date: string | undefined) => (date ? formatDate(date) : "Any time");
  const label = value.datePreset
    ? presets[value.datePreset]
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
  const min = range[0] || 1;
  const max = range[1] || 5;
  if (min === 1 && max === 5) return [];
  return [
    {
      id: "rating",
      label: `Rating: ${min === max ? min : `${min}–${max}`} ${min === max && min === 1 ? "star" : "stars"}`,
      ratingRange: [min, max],
      onRemove: () => onChange([1, 5]),
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
