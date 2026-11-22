"use client";

import { choicePillClass } from "@/components/ui/choice-pill";
import { FILTER_PILL_CLASS } from "@/components/ui/field";

/** A tour demo's local filter pills: one pressed choice, changed only in demo
 * state. `labels` renames an option on screen without changing its value. */
export function TourChoices<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          className={`${choicePillClass(value === option, "bg-foreground text-background")} ${FILTER_PILL_CLASS}`}
          onClick={() => onChange(option)}
        >
          {labels?.[option] ?? option}
        </button>
      ))}
    </div>
  );
}
