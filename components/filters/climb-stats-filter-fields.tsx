"use client";

import { NumberField } from "@heroui/react";

import { RatingRangeFilter } from "@/components/filters/min-rating-filter";
import { FIELD_WIDTH_CLASS, FILTER_ROW_CLASS, FILTER_LABEL_CLASS } from "@/components/ui/field";

/** Minimum logged-ascent-count filter, over climbs.send_count — a free-form
 * count rather than a fixed set of steps, so a plain number input fits
 * better than a dropdown. 0 means the filter is inactive. */
function MinAscentsField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className={FILTER_ROW_CLASS}>
      <span className={FILTER_LABEL_CLASS}>Min ascents</span>
      <NumberField
        value={value}
        onChange={(next) => onChange(Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0)}
        step={1}
        minValue={0}
        aria-label="Min ascents"
        className={FIELD_WIDTH_CLASS.short}
      >
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
    </div>
  );
}

export function ClimbStatsFields({
  ratingRange,
  onRatingRangeChange,
  minAscents,
  onMinAscentsChange,
  showMinAscents = true,
  showRatingFilters = true,
}: {
  ratingRange: [number, number];
  onRatingRangeChange: (range: [number, number]) => void;
  showMinAscents?: boolean;
  showRatingFilters?: boolean;
  minAscents: number;
  onMinAscentsChange: (value: number) => void;
}) {
  // An empty wrapper would still open a gap above the grade sliders.
  if (!showRatingFilters && !showMinAscents) return null;
  return (
    <div className="flex flex-col gap-4">
      {showRatingFilters && (
        <RatingRangeFilter value={ratingRange} onChange={onRatingRangeChange} />
      )}
      {showMinAscents && <MinAscentsField value={minAscents} onChange={onMinAscentsChange} />}
    </div>
  );
}
