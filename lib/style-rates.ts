import type { ClimbType } from "@/lib/grades";
import { ascentStylesFor, type AscentStyle } from "@/lib/sends";

export type FirstTryStyle = Exclude<AscentStyle, "redpoint">;

const FIRST_TRY_STYLES: readonly FirstTryStyle[] = ["flash", "onsight"];

/** The first-try styles a discipline has, in the order the rate chart draws
 * them: flash and onsight on ropes, flash alone on boulders. */
export function firstTryStyles(type: ClimbType): FirstTryStyle[] {
  const styles = ascentStylesFor(type);
  return FIRST_TRY_STYLES.filter((style) => styles.includes(style));
}

/** "Flash rate by grade", or "Flash and onsight rate by grade" on ropes. */
export function styleRateTitle(type: ClimbType): string {
  const names = firstTryStyles(type).map((style, i) =>
    i ? style : style[0].toUpperCase() + style.slice(1),
  );
  return `${names.join(" and ")} rate by grade`;
}
