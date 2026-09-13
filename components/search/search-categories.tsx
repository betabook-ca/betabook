"use client";

import { clsx } from "clsx";

import { SEARCH_LABELS, type SearchCategory } from "./search-types";

export function SearchCategories({
  value,
  onChange,
}: {
  value: SearchCategory;
  onChange: (category: SearchCategory) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Search category"
      className="flex max-w-full shrink-0 flex-wrap gap-1 self-start rounded-2xl bg-surface-secondary p-1"
    >
      {(["all", "climb", "area", "climber"] as const).map((category) => (
        <button
          key={category}
          type="button"
          aria-pressed={value === category}
          onClick={() => onChange(category)}
          className={clsx(
            "cursor-pointer rounded-full px-3 py-2 text-sm focus-visible:status-focused",
            value === category ? "bg-segment font-semibold text-segment-foreground" : "text-muted",
          )}
        >
          {SEARCH_LABELS[category]}
        </button>
      ))}
    </div>
  );
}
