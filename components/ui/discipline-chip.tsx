import { Chip } from "@heroui/react";

import type { ClimbType } from "@/lib/grades";

// success/warning are reserved for ascent-style chips (AscentStyle), and
// HeroUI's only other built-in tokens are accent/default — too few hues for
// three disciplines that need to read as distinct from each other and from
// gray. Each discipline instead has its own bg/fg custom properties with
// per-theme (light + dark) values derived from the palette in
// app/globals.css (trad = green, sport = support blue, boulder = rose) —
// plain utilities referencing them win over the chip's own colors by layer
// order (utilities > components), no `!` needed.
export const DISCIPLINE_CHIP_CLASSNAME: Record<ClimbType, string> = {
  boulder: "bg-(--discipline-boulder-bg) text-(--discipline-boulder-fg)",
  sport: "bg-(--discipline-sport-bg) text-(--discipline-sport-fg)",
  trad: "bg-(--discipline-trad-bg) text-(--discipline-trad-fg)",
};

export const DISCIPLINE_LABELS: Record<ClimbType, string> = {
  boulder: "Boulder",
  sport: "Sport",
  trad: "Trad",
};

/** The discipline hue as a raw CSS color, for charts that paint with the
 * palette directly (histogram bars, analytics lines, calendar squares)
 * rather than the soft chip tints above. */
export const DISCIPLINE_HUE: Record<ClimbType, string> = {
  boulder: "var(--color-palette-accent)",
  sport: "var(--color-palette-support)",
  trad: "var(--color-palette-primary)",
};

/** The discipline tag: a soft palette-tinted chip.
 * Chips mean discipline; ascent styles have their own chip set
 * (AscentStyle); the sent tick is its own device. */
export function DisciplineChip({ type }: { type: ClimbType }) {
  return (
    // font-sans pinned: chips inherit font-family, so one placed inside a
    // mono context (the crag header's info strip) would silently change
    // face — the tag reads identically everywhere.
    <Chip variant="soft" size="sm" className={`font-sans ${DISCIPLINE_CHIP_CLASSNAME[type]}`}>
      {DISCIPLINE_LABELS[type]}
    </Chip>
  );
}
