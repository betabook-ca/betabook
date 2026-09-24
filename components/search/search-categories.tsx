"use client";

import { clsx } from "clsx";

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
    <div
      role="group"
      aria-label="Search category"
      className={clsx(SEGMENT_TRACK_CLASS, compact ? "flex-nowrap" : "flex-wrap")}
    >
      {(["all", "climb", "area", "climber"] as const).map((category) => (
        <button
          key={category}
          type="button"
          aria-pressed={value === category}
          onClick={() => onChange(category)}
          className={segmentPillClass(value === category, compact)}
        >
          {SEARCH_LABELS[category]}
        </button>
      ))}
    </div>
  );
}
