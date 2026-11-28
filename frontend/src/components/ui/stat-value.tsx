import { clsx } from "clsx";
import type { ReactNode } from "react";

const STAT_TONE = {
  danger: "text-danger",
  warning: "text-warning",
} as const;

const STAT_SIZE = {
  /** Stat tiles, the costs total, import counts. */
  md: "font-display text-2xl",
  /** Several values packed into one sidebar card (StatStrip). */
  sm: "text-lg leading-tight",
} as const;

/** The number under an eyebrow. Tabular numerals keep adjacent values
 * aligned. */
export function StatValue({
  children,
  tone,
  size = "md",
}: {
  children: ReactNode;
  /** Flags a count that needs attention. */
  tone?: keyof typeof STAT_TONE;
  size?: keyof typeof STAT_SIZE;
}) {
  return (
    <span
      className={clsx(
        "font-semibold tabular-nums",
        STAT_SIZE[size],
        tone ? STAT_TONE[tone] : "text-foreground",
      )}
    >
      {children}
    </span>
  );
}
