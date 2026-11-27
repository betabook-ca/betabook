import type { ClimbType } from "@/lib/grades";
import type { ActionArgs } from "@/spa/lib/action-contracts";

export type { ImportResult } from "@/spa/lib/action-contracts";
export type ImportSendRow = ActionArgs<"importSends">[0][number];

export const ASCENT_STYLES = ["redpoint", "flash", "onsight"] as const;
export type AscentStyle = (typeof ASCENT_STYLES)[number];

/** One shared sentence-case label map — the same names everywhere an
 * ascent style is written out (chips, the climb page's breakdown, the import
 * wizard's value mapping, analytics). */
export const ASCENT_STYLE_LABELS: Record<AscentStyle, string> = {
  onsight: "Onsight",
  flash: "Flash",
  redpoint: "Redpoint",
};

const BOULDER_ASCENT_STYLES = ["redpoint", "flash"] as const;

/** Bouldering has no onsight/flash distinction, so a boulder sent first try is
 * a flash. Onsight stays a rope-only style; migration 0042's triggers enforce
 * the same rule in D1. */
export function ascentStylesFor(climbType: ClimbType): readonly AscentStyle[] {
  return climbType === "boulder" ? BOULDER_ASCENT_STYLES : ASCENT_STYLES;
}

export const IMPORT_BATCH_SIZE = 50;

// Bounds lookup work and response size; names use a single JSON binding.
export const RESOLVE_BATCH_SIZE = 100;

export const GRADE_FEEL_VALUES = ["low", "solid", "high"] as const;
export type GradeFeel = (typeof GRADE_FEEL_VALUES)[number];

/** The `YYYY-MM-DD` shape alone. Enough for a key that only has to match
 * stored dates; user-entered dates go through `isRealIsoDate`. */
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's UTC calendar date as `YYYY-MM-DD`. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Allow one day past UTC today because the client's calendar date may be ahead. */
export function latestAcceptableSendDate(today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/** The style a discipline records `style` as: a boulder "onsight" is a
 * flash. Imports coerce with it, and analytics reads with it, since a climb
 * moved from ropes to bouldering keeps its sends' stored onsights. */
export function ascentStyleOn(style: AscentStyle, climbType: ClimbType): AscentStyle {
  return ascentStylesFor(climbType).includes(style) ? style : "flash";
}

/** Validate the calendar date as well as its ISO shape, rejecting values such as 2026-02-30. */
export function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}
