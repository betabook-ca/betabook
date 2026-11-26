"use client";

import { Checkbox, NumberField } from "@heroui/react";

import { RatingRangeFilter } from "@/components/filters/min-rating-filter";
import {
  FIELD_WIDTH_CLASS,
  FILTER_CONTROL_CLASS,
  FILTER_LABEL_CLASS,
  FILTER_ROW_CLASS,
} from "@/components/ui/field";

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

/** Hides climbs the reader has sent. Their own sends only, so it is offered
 * to signed-in readers alone. */
function ExcludeSentField({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className={FILTER_ROW_CLASS}>
      {/* Lines the checkbox up with the rating and ascents controls; the
       * checkbox names itself, so this label stays out of the a11y tree. */}
      <span aria-hidden className={FILTER_LABEL_CLASS}>
        Sends
      </span>
      <Checkbox isSelected={value} onChange={onChange} className={FILTER_CONTROL_CLASS}>
        <Checkbox.Content className="flex min-h-11 items-center gap-2 whitespace-nowrap">
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <span className="text-sm">Exclude sent</span>
        </Checkbox.Content>
      </Checkbox>
    </div>
  );
}

export function ClimbStatsFields({
  ratingRange,
  onRatingRangeChange,
  minAscents,
  onMinAscentsChange,
  showMinAscents = true,
  excludeSent = false,
  onExcludeSentChange,
}: {
  ratingRange: [number, number];
  onRatingRangeChange: (range: [number, number]) => void;
  showMinAscents?: boolean;
  minAscents: number;
  onMinAscentsChange: (value: number) => void;
  excludeSent?: boolean;
  /** Pass only for a signed-in reader; without it the field is left out. */
  onExcludeSentChange?: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {onExcludeSentChange && (
        <ExcludeSentField value={excludeSent} onChange={onExcludeSentChange} />
      )}
      <RatingRangeFilter value={ratingRange} onChange={onRatingRangeChange} />
      {showMinAscents && <MinAscentsField value={minAscents} onChange={onMinAscentsChange} />}
    </div>
  );
}
