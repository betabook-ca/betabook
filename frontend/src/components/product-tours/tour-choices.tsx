"use client";

import { choicePillClass } from "@/components/ui/choice-pill";
import { ChoicePills } from "@/components/ui/choice-pills";
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
    <ChoicePills
      label={label}
      selectionMode="single"
      value={[value]}
      onChange={([next]) => {
        if (next !== undefined) onChange(next);
      }}
      options={options.map((option) => ({ value: option, label: labels?.[option] ?? option }))}
      pillClass={(selected) =>
        `${choicePillClass(selected, "bg-foreground text-background")} ${FILTER_PILL_CLASS}`
      }
      className="flex flex-wrap gap-1.5"
    />
  );
}
