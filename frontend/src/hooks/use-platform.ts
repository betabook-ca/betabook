"use client";

import { useMounted } from "@/hooks/use-mounted";

/** True on macOS/iOS, where the modifier is Command. Everywhere else —
 * Windows, Linux, ChromeOS — there is no Command key and the modifier is
 * Control.
 *
 * `userAgentData.platform` is the supported reading; `navigator.platform` is
 * deprecated but still the only one Safari and Firefox provide, so it stays
 * as the fallback. */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const modern = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = modern?.platform ?? navigator.platform ?? "";
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export type ModifierLabels = {
  /** The chord that opens the palette, e.g. "⌘K" / "Ctrl K". */
  palette: string;
  /** Modifier + Enter, e.g. "⌘↵" / "Ctrl ↵". */
  modEnter: string;
  /** For `aria-keyshortcuts`, which takes key names rather than glyphs. */
  ariaPalette: string;
};

/** Platform-correct shortcut labels, resolved only after mount: the server
 * can't know the platform, and rendering a guess would hydrate "Ctrl" over a
 * Mac's "⌘". Null until then, so callers render nothing rather than a wrong
 * key. */
export function useModifierLabels(): ModifierLabels | null {
  const mounted = useMounted();
  if (!mounted) return null;

  return isApplePlatform()
    ? { palette: "⌘K", modEnter: "⌘↵", ariaPalette: "Meta+K" }
    : { palette: "Ctrl K", modEnter: "Ctrl ↵", ariaPalette: "Control+K" };
}
