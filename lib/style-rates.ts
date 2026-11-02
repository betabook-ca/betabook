import type { ClimbType } from "@/lib/grades";
import { ASCENT_STYLE_LABELS, ascentStylesFor, type AscentStyle } from "@/lib/sends";

export type FirstTryStyle = Exclude<AscentStyle, "redpoint">;

/** The first-try styles a discipline has, in the order the rate chart draws
 * them: flash and onsight on ropes, flash alone on boulders. */
export function firstTryStyles(type: ClimbType): FirstTryStyle[] {
  return ascentStylesFor(type).filter((style): style is FirstTryStyle => style !== "redpoint");
}

/** "Flash rate by grade", or "Flash and onsight rate by grade" on ropes. */
export function styleRateTitle(type: ClimbType): string {
  const names = firstTryStyles(type).map((style, i) =>
    i ? ASCENT_STYLE_LABELS[style].toLowerCase() : ASCENT_STYLE_LABELS[style],
  );
  return `${names.join(" and ")} rate by grade`;
}
