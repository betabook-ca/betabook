import type { ClimbType } from "@/lib/grades";

/** Literal brand colors for `ImageResponse` cards. Satori renders a static
 * image with no cascade, so it cannot resolve the `var(--palette-*)` /
 * `color-mix()` tokens `app/globals.css` uses everywhere else — these are
 * the same swatches, copied as plain hex. Keep in sync with `--palette-*`
 * and the coral sun in `assets/branding/README.md` by hand. */
export const OG_COLORS = {
  ink: "#000000",
  paper: "#eaf7ef",
  coral: "#ef846c",
  primary: "#83ba73",
  support: "#557bb5",
  accent: "#a4585a",
} as const;

/** The same trad/sport/boulder hues as `DISCIPLINE_HUE`, as literal hex. */
export const OG_DISCIPLINE_COLOR: Record<ClimbType, string> = {
  trad: OG_COLORS.primary,
  sport: OG_COLORS.support,
  boulder: OG_COLORS.accent,
};

/** A translucent tint of an `OG_COLORS`/`OG_DISCIPLINE_COLOR` hex, for the
 * soft chip-style backgrounds `--discipline-*-bg` uses elsewhere
 * (`color-mix(in oklab, <hue> 22%, white)`) — satori has no `color-mix`, but
 * an alpha overlay on the same paper backdrop reads the same and stays
 * mechanically in sync with the hex above it instead of a second hand-copied
 * constant. 6-digit hex only, which is all `OG_COLORS` ever holds. */
export function withAlpha(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
