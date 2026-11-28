"use client";

import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
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

/** Exactly-one-of-a-few as HeroUI's ToggleButtonGroup: a radio group the
 * arrow keys move through, the chosen segment solid and the rest outlined
 * (`.toggle-button--segment` in globals.css). The app's one segmented control
 * for exclusive choices in forms (grade feel, import conflict mode) and binary
 * preferences (grading systems); tag-shaped choices use `choicePillClass`
 * instead. */
export function SegmentedButtons<V extends string>({
  value,
  onChange,
  options,
  className,
  isDisabled = false,
  ariaLabel,
}: SegmentedButtonsProps<V>) {
  return (
    <ToggleButtonGroup
      fullWidth
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const [next] = keys;
        if (next !== undefined) onChange(String(next) as V);
      }}
      isDisabled={isDisabled}
      aria-label={ariaLabel}
      className={className}
    >
      {options.map((option) => (
        <ToggleButton
          key={option.value}
          id={option.value}
          className="toggle-button--segment flex-1 gap-1.5"
        >
          {({ isSelected }) => (
            <>
              {option.label}
              {option.hint && (
                <span className={clsx("font-normal", !isSelected && "text-muted")}>
                  ({option.hint})
                </span>
              )}
            </>
          )}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
