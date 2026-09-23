"use client";

import { Button } from "@heroui/react";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import type { ActiveFilter } from "@/components/filters/active-filter-summary";
import { FilterToolbar } from "@/components/filters/filter-toolbar";
import type { ClimbRefinements } from "@/lib/filters/climb-refinements";

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
  /** Absent in a picker, where the order of a short result list is not the question. */
  sortControl?: ReactNode;
  ratingControl: ReactNode;
  onReset: () => void;
  activeFilters: ActiveFilter[];
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
          ...activeFilters,
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
        sortControl={sortControl}
        extraFilters={ratingControl}
        onReset={onReset}
      />
    </div>
  );
}
