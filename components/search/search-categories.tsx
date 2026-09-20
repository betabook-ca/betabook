"use client";

import { clsx } from "clsx";

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
      className={clsx(
        "flex max-w-full shrink-0 gap-1 self-start rounded-2xl bg-surface-secondary p-1",
        compact ? "flex-nowrap" : "flex-wrap",
      )}
    >
      {(["all", "climb", "area", "climber"] as const).map((category) => (
        <button
          key={category}
          type="button"
          aria-pressed={value === category}
          onClick={() => onChange(category)}
          className={clsx(
            "cursor-pointer rounded-full text-sm whitespace-nowrap focus-visible:status-focused",
            compact ? "px-3 py-1.5" : "px-3 py-2",
            value === category ? "bg-segment font-semibold text-segment-foreground" : "text-muted",
          )}
        >
          {SEARCH_LABELS[category]}
        </button>
      ))}
    </div>
  );
}
