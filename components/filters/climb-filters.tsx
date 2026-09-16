"use client";

import { Button } from "@heroui/react";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import type { ActiveFilter } from "@/components/filters/active-filter-summary";
import { ratingActiveFilters } from "@/components/filters/active-filter-values";
import { FilterToolbar } from "@/components/filters/filter-toolbar";
import { RatingRangeFilter } from "@/components/filters/min-rating-filter";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { OptionSelect } from "@/components/ui/option-select";
import type { ClimbRefinements } from "@/lib/filters/climb-refinements";
import { DEFAULT_DISCIPLINE_FILTER } from "@/lib/filters/discipline-filter";

export function ClimbFilters({
  value,
  onChange,
  areaControl,
  sortControl,
  ratingControl,
  onReset,
  activeFilters,
}: {
  value: ClimbRefinements;
  onChange: (value: ClimbRefinements) => void;
  areaControl?: ReactNode;
  sortControl?: ReactNode;
  ratingControl?: ReactNode;
  onReset?: () => void;
  activeFilters?: ActiveFilter[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {areaControl}
      {value.area && (
        <Button
          variant="secondary"
          size="sm"
          className="max-w-full self-start"
          aria-label={`Clear area ${value.area.name}`}
          onPress={() => onChange({ ...value, area: null })}
        >
          <span className="truncate">In area: {value.area.name}</span>
          <X className="size-3.5 shrink-0" aria-hidden />
        </Button>
      )}
      <FilterToolbar
        value={value}
        onChange={onChange}
        activeFilters={[
          ...(activeFilters ??
            ratingActiveFilters([value.minRating, value.maxRating], ([minRating, maxRating]) =>
              onChange({ ...value, minRating, maxRating }),
            )),
          ...(value.area
            ? [
                {
                  id: "area",
                  label: `Area: ${value.area.name}`,
                  onRemove: () => onChange({ ...value, area: null }),
                },
              ]
            : []),
        ]}
        sortControl={
          sortControl ?? (
            <OptionSelect
              ariaLabel="Sort results"
              value={value.sort}
              onChange={(sort) => onChange({ ...value, sort })}
              options={[
                { value: "name_asc", label: "Name A–Z" },
                { value: "name_desc", label: "Name Z–A" },
              ]}
              className={FIELD_WIDTH_CLASS.medium}
            />
          )
        }
        extraFilters={
          ratingControl ?? (
            <>
              <RatingRangeFilter
                value={[value.minRating, value.maxRating]}
                onChange={([minRating, maxRating]) => onChange({ ...value, minRating, maxRating })}
              />
            </>
          )
        }
        onReset={
          onReset ??
          (() =>
            onChange({
              ...DEFAULT_DISCIPLINE_FILTER,
              area: null,
              minRating: 0,
              maxRating: 0,
              sort: "name_asc",
            }))
        }
      />
    </div>
  );
}
