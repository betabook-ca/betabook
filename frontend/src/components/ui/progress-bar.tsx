"use client";

import { Meter, ProgressBar as HeroProgressBar } from "@heroui/react";
import { clsx } from "clsx";

type BarProps = {
  value: number;
  max: number;
  label: string;
  /** `sm` is the inline track beside a count; its dark track is lightened so
   * it still reads against a row. */
  size?: "sm" | "md";
};

/** The track both bars share: our surface and accent rather than HeroUI's
 * default fill, fully rounded. */
function trackClass(size: "sm" | "md") {
  return clsx("rounded-full bg-surface", size === "sm" ? "h-1 dark:bg-white" : "h-2");
}
const FILL_CLASS = "rounded-full bg-accent";

/** Clamped once so assistive tech hears what the fill shows. */
function clamp(value: number, max: number) {
  return Math.min(Math.max(0, max), Math.max(0, value));
}

/** A task moving toward done: an import's rows, a file's upload. */
export function ProgressBar({ value, max, label, size = "md" }: BarProps) {
  return (
    <HeroProgressBar aria-label={label} value={clamp(value, max)} maxValue={max} className="gap-0">
      <HeroProgressBar.Track className={trackClass(size)}>
        <HeroProgressBar.Fill className={FILL_CLASS} />
      </HeroProgressBar.Track>
    </HeroProgressBar>
  );
}

/** An amount within a known range that isn't a task: a goal's progress, a
 * plan's usage. */
export function AmountMeter({ value, max, label, size = "md" }: BarProps) {
  return (
    <Meter aria-label={label} value={clamp(value, max)} maxValue={max} className="gap-0">
      <Meter.Track className={trackClass(size)}>
        <Meter.Fill className={FILL_CLASS} />
      </Meter.Track>
    </Meter>
  );
}
