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
  textFilter,
  ratingControl,
  onReset,
  activeFilters,
}: {
  value: ClimbRefinements;
  onChange: (value: ClimbRefinements) => void;
  areaControl?: ReactNode;
  /** Absent in a picker, where the order of a short result list is not the question. */
  sortControl?: ReactNode;
  /** A text box beside the discipline chips, for lists without a search box. */
  textFilter?: ReactNode;
  ratingControl: ReactNode;
  onReset: () => void;
  activeFilters: ActiveFilter[];
}) {
  return (
    // The area scopes everything below it, so it stands a little apart from
    // the toolbar rather than reading as one more of its rows.
    <div className="flex flex-col gap-5">
      {(areaControl || value.area) && (
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
        </div>
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
        textFilter={textFilter}
        extraFilters={ratingControl}
        onReset={onReset}
      />
    </div>
  );
}
