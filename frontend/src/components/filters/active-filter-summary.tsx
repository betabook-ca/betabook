"use client";

import { Button } from "@heroui/react";
import { X } from "lucide-react";

import { choicePillClass } from "@/components/ui/choice-pill";
import { RatingStars } from "@/components/ui/rating-stars";

export type ActiveFilter = {
  id: string;
  label: string;
  ratingRange?: [number, number];
  onRemove: () => void;
};

/** Remains outside the disclosure so hidden controls never hide applied filters. */
export function ActiveFilterSummary({
  filters,
  onClear,
}: {
  filters: ActiveFilter[];
  onClear: () => void;
}) {
  if (!filters.length) return null;
  return (
    <section aria-label="Active filters" className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted">Filtered by</span>
      {filters.map((filter) => (
        <button
          key={filter.id}
          type="button"
          aria-label={`Remove ${filter.label}`}
          onClick={filter.onRemove}
          className={`${choicePillClass(true, "bg-surface-secondary text-foreground")} inline-flex max-w-full items-center gap-1.5`}
        >
          <span className="min-w-0 break-words">
            {filter.ratingRange ? (
              <span className="inline-flex items-center gap-1" aria-hidden>
                Rating: <RatingStars rating={filter.ratingRange[0]} />
                {filter.ratingRange[0] !== filter.ratingRange[1] && (
                  <>
                    –<RatingStars rating={filter.ratingRange[1]} />
                  </>
                )}
              </span>
            ) : (
              filter.label
            )}
          </span>
          <X className="size-3.5 shrink-0" aria-hidden />
        </button>
      ))}
      <Button variant="ghost" size="sm" onPress={onClear}>
        Clear all
      </Button>
    </section>
  );
}
