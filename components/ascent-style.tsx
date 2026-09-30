import { Chip } from "@heroui/react/chip";

import { formatDate } from "@/lib/format-date";
import type { AscentStyle } from "@/lib/sends";

/** One shared sentence-case label map — the same names everywhere an
 * ascent style is written out (chips here, the climb page's breakdown,
 * the import wizard's value mapping). */
export const ASCENT_STYLE_LABELS: Record<AscentStyle, string> = {
  onsight: "Onsight",
  flash: "Flash",
  redpoint: "Redpoint",
};

// Ordered best-to-baseline: onsight (first try, no info) > flash (first
// try, with info) > redpoint (after prior attempts). Redpoint is the
// everyday baseline, not a failure state, so it stays neutral gray; onsight
// gets the palette green (HeroUI's soft success pair); flash gets a
// support-blue tint instead of HeroUI's amber, which the rating stars own.
// Flash and redpoint come from --ascent-*-* tokens in globals.css rather
// than HeroUI's derived chip colors — a neutral chip needs a per-theme
// lightness the `default` soft variant doesn't give it in dark. Exported so
// the send form's ascent picker can wear the same pair on its chosen pill.
export const ASCENT_STYLE_CHIP_CLASSNAME: Record<AscentStyle, string> = {
  onsight: "bg-success-soft text-success-soft-foreground",
  flash: "bg-(--ascent-flash-bg) text-(--ascent-flash-fg)",
  redpoint: "bg-(--ascent-redpoint-bg) text-(--ascent-redpoint-fg)",
};

/** "Flash · Sep 6, 2026": a send in one line, as video captions give it. */
export function ascentSummary(style: AscentStyle, dateSent: string | null): string {
  return `${ASCENT_STYLE_LABELS[style]} · ${dateSent ? formatDate(dateSent) : "Date unknown"}`;
}

export function AscentStyle({ type }: { type: AscentStyle }) {
  return (
    <Chip variant="soft" size="sm" className={ASCENT_STYLE_CHIP_CLASSNAME[type]}>
      {ASCENT_STYLE_LABELS[type]}
    </Chip>
  );
}
