"use client";

import { Button, ButtonGroup } from "@heroui/react";
import { clsx } from "clsx";

type SegmentedButtonsProps<V extends string> = {
  value: V;
  onChange: (value: V) => void;
  /** `hint` is a quieter example beside the label, e.g. a sample grade in
   * the system the segment names, so both choices explain themselves. */
  options: readonly { value: V; label: string; hint?: string }[];
  className?: string;
  isDisabled?: boolean;
  /** Names the group for assistive tech when no visible label precedes it. */
  ariaLabel?: string;
};

/** Exactly-one-of-a-few as a button group: the chosen segment is solid, the
 * rest outlined. The app's one segmented control for exclusive choices in
 * forms (grade feel, import conflict mode) and binary preferences (grading
 * systems); tag-shaped choices use `choicePillClass` instead. */
export function SegmentedButtons<V extends string>({
  value,
  onChange,
  options,
  className,
  isDisabled = false,
  ariaLabel,
}: SegmentedButtonsProps<V>) {
  return (
    <ButtonGroup className={clsx("w-full", className)} aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Button
            key={option.value}
            type="button"
            isDisabled={isDisabled}
            aria-pressed={selected}
            variant={selected ? undefined : "outline"}
            onPress={() => onChange(option.value)}
            className="flex-1 gap-1.5"
          >
            {option.label}
            {option.hint && (
              <span className={clsx("font-normal", selected ? "opacity-80" : "text-muted")}>
                ({option.hint})
              </span>
            )}
          </Button>
        );
      })}
    </ButtonGroup>
  );
}
