import type { ComponentProps } from "react";

/** Shared single-ring magnifier. Keep the combobox CSS data URI in sync. */
export function SearchIcon({
  active = false,
  className = "size-5 shrink-0",
  ...props
}: ComponentProps<"svg"> & { active?: boolean }) {
  return (
    <svg
      aria-hidden
      data-search-icon
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.8 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
