"use client";

import { clsx } from "clsx";

import { ChoicePills } from "@/components/ui/choice-pills";
import { SEGMENT_TRACK_CLASS, segmentPillClass } from "@/components/ui/segment-pills";

import { SEARCH_LABELS, type SearchCategory } from "./search-types";

export function SearchCategories({
  value,
  onChange,
  compact = false,
}: {
  value: SearchCategory;
  onChange: (category: SearchCategory) => void;
  /** On short viewports the pills stop wrapping and lose some vertical
   * padding to free up result rows. They stay at least 32px tall, and the
   * row scrolls sideways. */
  compact?: boolean;
}) {
  return (
    <ChoicePills
      label="Search category"
      selectionMode="single"
      value={[value]}
      onChange={([next]) => {
        if (next !== undefined) onChange(next);
      }}
      options={(["all", "climb", "area", "climber"] as const).map((category) => ({
        value: category,
        label: SEARCH_LABELS[category],
      }))}
      pillClass={(selected) => segmentPillClass(selected, compact)}
      className={clsx(SEGMENT_TRACK_CLASS, compact ? "flex-nowrap" : "flex-wrap")}
    />
  );
}
