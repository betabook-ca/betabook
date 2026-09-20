import type { ReactElement } from "react";

import { OG_FONT } from "@/lib/og-fonts";
import { OG_COLORS, withAlpha } from "@/lib/og-theme";
import { SITE_NAME } from "@/lib/site";

/** The mountain-into-checkmark silhouette, verbatim from the `mountain`
 * constant in scripts/generate-brand-assets.ts (the icon SVGs' shared path).
 * There is one canonical shape; keep both copies in sync by hand. */
const MOUNTAIN_PATH =
  "M129 151 L202 78 Q205 75 208 78 L237 108 L249 97 Q252 94 255 97 L282 124 L359 62 Q361 60.5 360 63 L285 138 Q282 141 279 138 L252 111 L240 122 Q237 125 234 122 L205 92 L147 151 Z";

/** The icon-only mark: a mountain becomes a checkmark beneath the sun. Same
 * `viewBox` as `betabook-icon-*.svg` (see assets/branding/README.md), so
 * this is the production artwork, not a redrawn approximation — satori
 * renders inline `<svg>`/`<path>`/`<circle>` as literal vector shapes. */
export function BetabookMark({
  size,
  color,
  sunColor = OG_COLORS.coral,
}: {
  size: number;
  color: string;
  sunColor?: string;
}): ReactElement {
  return (
    <svg width={size} height={size} viewBox="113 -34 264 264" style={{ display: "flex" }}>
      <path d={MOUNTAIN_PATH} fill={color} />
      <circle cx={312} cy={60} r={14} fill={sunColor} />
    </svg>
  );
}

/** Mark plus lowercase wordmark, no tagline — the "Header, at 640px and
 * wider" placement from assets/branding/README.md (both cards are far past
 * that width), at that same 48px mark size so it is the identical lockup,
 * not a scaled-down approximation. */
function BetabookLockup({ color }: { color: string }): ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <BetabookMark size={48} color={color} />
      <span
        style={{
          fontFamily: OG_FONT.display,
          fontWeight: 700,
          fontSize: 36,
          color,
          letterSpacing: 0.5,
        }}
      >
        {SITE_NAME.toLowerCase()}
      </span>
    </div>
  );
}

/** The label/value/sub stat block both cards render, unified into one
 * component so a viewer who has seen one card recognizes the other. `tint`
 * softly colors the tile (a discipline hue, e.g. profile-share's peak-grade
 * tile) instead of the neutral default — the same soft-chip idea as
 * `--discipline-*-bg`/`-fg`, not a full-strength fill. */
export function Tile({
  label,
  value,
  sub,
  tint,
}: {
  label: string;
  value: string;
  sub?: string;
  tint?: string;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        flex: 1,
        background: tint ? withAlpha(tint, 0.14) : "rgba(0,0,0,0.045)",
        borderRadius: 22,
        padding: "32px 34px",
      }}
    >
      <span
        style={{
          fontFamily: OG_FONT.body,
          fontWeight: 500,
          fontSize: 20,
          color: tint ?? "rgba(0,0,0,0.56)",
          textTransform: "uppercase",
          letterSpacing: 3,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: OG_FONT.display,
          fontWeight: 700,
          fontSize: 52,
          color: OG_COLORS.ink,
          lineHeight: 1.05,
        }}
      >
        {value}
      </span>
      {sub && (
        <span
          style={{
            fontFamily: OG_FONT.body,
            fontWeight: 500,
            fontSize: 19,
            color: "rgba(0,0,0,0.56)",
            maxWidth: 380,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

/** The chrome both cards share: header lockup, the card's own middle
 * content, then a footer line naming the site and domain — so the
 * profile-share and stats recap cards read as one family instead of two
 * independently designed images. Fills `width`/`height` from `ImageResponse`
 * rather than hard-coding either card's own pixel size. */
export function CardFrame({
  padding,
  align = "center",
  children,
}: {
  padding: number;
  /** `"center"` (default) vertically centers the content in the space
   * between header and footer — right for a short, self-contained moment
   * (the empty state's icon+message). `"start"` anchors it a fixed distance
   * below the header instead and pushes the rest of the leftover height
   * below it, so a content block much shorter than the card (the portrait
   * recap card especially) reads as "generous margin above the footer," not
   * as an accidentally empty middle. */
  align?: "center" | "start";
  children: ReactElement;
}): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: OG_COLORS.paper,
        backgroundImage: `radial-gradient(circle at 84% -12%, ${withAlpha(OG_COLORS.coral, 0.16)}, ${withAlpha(OG_COLORS.coral, 0)} 45%)`,
        padding,
        fontFamily: OG_FONT.body,
      }}
    >
      <BetabookLockup color={OG_COLORS.ink} />
      {align === "start" && <div style={{ display: "flex", height: padding }} />}
      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: align === "center" ? "center" : "flex-start",
        }}
      >
        {children}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span
          style={{
            fontFamily: OG_FONT.body,
            fontWeight: 500,
            fontSize: 22,
            color: "rgba(0,0,0,0.56)",
          }}
        >
          Climbing logbook & crag database
        </span>
        <span
          style={{
            fontFamily: OG_FONT.body,
            fontWeight: 500,
            fontSize: 22,
            color: "rgba(0,0,0,0.56)",
          }}
        >
          betabook.ca
        </span>
      </div>
    </div>
  );
}
