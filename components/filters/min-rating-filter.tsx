"use client";

import { useId } from "react";

import { FILTER_ROW_CLASS, FILTER_LABEL_CLASS, FILTER_CONTROL_CLASS } from "@/components/ui/field";
import { RatingField } from "@/components/ui/rating-field";

/** A full 1–5 range is unfiltered; narrowing either side keeps the bounds ordered. */
export function RatingRangeFilter({
  value,
  onChange,
}: {
  value: [number, number];
  onChange: (value: [number, number]) => void;
}) {
  const min = value[0] || 1;
  const max = value[1] || 5;
  const helperId = useId();
  return (
    <div
      role="group"
      aria-label="Rating range"
      aria-describedby={helperId}
      className={FILTER_ROW_CLASS}
    >
      <span className={FILTER_LABEL_CLASS}>Rating</span>
      <div className="min-w-0">
        <div
          className={`${FILTER_CONTROL_CLASS} flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2`}
        >
          <RatingField
            label="Min rating"
            hideLabel
            value={min}
            compact
            allowClear={false}
            onValueChange={(rating) => {
              const next = rating ?? 1;
              onChange([next, Math.max(next, max)]);
            }}
          />
          <span aria-hidden className="text-muted">
            –
          </span>
          <RatingField
            label="Max rating"
            hideLabel
            value={max}
            compact
            allowClear={false}
            onValueChange={(rating) => {
              const next = rating ?? 5;
              onChange([Math.min(min, next), next]);
            }}
          />
        </div>
        <p id={helperId} className="text-sm text-muted">
          {min === 1 && max === 5 ? "Includes unrated climbs" : "Excludes unrated climbs"}
        </p>
      </div>
    </div>
  );
}
