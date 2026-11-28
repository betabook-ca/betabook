"use client";

import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { clsx } from "clsx";
import type { ReactNode } from "react";

type ChoicePillsProps<V extends string> = {
  /** Names the group for assistive tech. */
  label: string;
  options: readonly { value: V; label: ReactNode }[];
  /** `single` is a radio group the arrow keys move through; `multiple` is a
   * row of toggle buttons. */
  selectionMode: "single" | "multiple";
  value: readonly V[];
  onChange: (value: V[]) => void;
  /** For `single`: whether pressing the chosen pill clears it. */
  allowEmpty?: boolean;
  /** Each pill's classes, from its state: `choicePillClass` with the tag's
   * own colors, or `segmentPillClass` on a segment track. */
  pillClass: (selected: boolean, value: V) => string;
  className?: string;
};

/** A row of tag-shaped choices on HeroUI's ToggleButtonGroup. The pills keep
 * the app's own look (`.toggle-button--pill` in globals.css clears HeroUI's
 * fill so `pillClass` paints them); the group supplies the selection
 * semantics and keyboard handling. Use SegmentedButtons for a form's
 * exclusive choice laid out as one bar. */
export function ChoicePills<V extends string>({
  label,
  options,
  selectionMode,
  value,
  onChange,
  allowEmpty = selectionMode === "multiple",
  pillClass,
  className,
}: ChoicePillsProps<V>) {
  return (
    <ToggleButtonGroup
      isDetached
      aria-label={label}
      selectionMode={selectionMode}
      disallowEmptySelection={!allowEmpty}
      selectedKeys={value}
      onSelectionChange={(keys) => {
        // Keep the options' order, not the order they were pressed in.
        onChange(options.filter((option) => keys.has(option.value)).map((option) => option.value));
      }}
      className={clsx("h-auto justify-start", className)}
    >
      {options.map((option) => (
        <ToggleButton
          key={option.value}
          id={option.value}
          className={({ isSelected }) =>
            clsx("toggle-button--pill", pillClass(isSelected, option.value))
          }
        >
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
