"use client";

import { Button, ButtonGroup } from "@heroui/react";
import { clsx } from "clsx";

type SegmentedButtonsProps<V extends string> = {
  value: V;
  onChange: (value: V) => void;
  options: readonly { value: V; label: string }[];
  className?: string;
  isDisabled?: boolean;
};

/** Exactly-one-of-a-few as a button group: the chosen segment is solid, the
 * rest outlined. The app's one segmented control for exclusive choices in
 * forms (grade feel, import conflict mode); tag-shaped choices use
 * `choicePillClass` instead. */
export function SegmentedButtons<V extends string>({
  value,
  onChange,
  options,
  className,
  isDisabled = false,
}: SegmentedButtonsProps<V>) {
  return (
    <ButtonGroup className={clsx("w-full", className)}>
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
            className="flex-1"
          >
            {option.label}
          </Button>
        );
      })}
    </ButtonGroup>
  );
}
