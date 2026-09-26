import { clsx } from "clsx";
import type { ReactNode } from "react";

const STAT_TONE = {
  danger: "text-danger",
  warning: "text-warning",
} as const;

/** The big number under an eyebrow — stat tiles, the costs total, import
 * counts. The one use of the display face beyond titles and names (see
 * --font-display in app/globals.css). */
export function StatValue({
  children,
  tone,
}: {
  children: ReactNode;
  /** Flags a count that needs attention. */
  tone?: keyof typeof STAT_TONE;
}) {
  return (
    <span
      className={clsx(
        "font-display text-2xl font-semibold tabular-nums",
        tone ? STAT_TONE[tone] : "text-foreground",
      )}
    >
      {children}
    </span>
  );
}
