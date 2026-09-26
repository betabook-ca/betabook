import { PALETTE_INK, PALETTE_PAPER } from "@/lib/palette";

/** Keeps the browser-chrome theme-color in step with an explicit theme
 * choice. Browsers use the first matching meta, so an explicit light/dark
 * pick precedes the layout's media-scoped OS defaults. "system" removes it so the
 * media-scoped pair applies again. The boot script in app/layout.tsx
 * duplicates this logic for first paint — keep the two in sync. */
export function syncThemeColorMeta(theme: string): void {
  if (typeof document === "undefined") return;
  for (const m of document.querySelectorAll('meta[name="theme-color"][data-explicit-theme]')) {
    m.remove();
  }
  if (theme === "light" || theme === "dark") {
    const m = document.createElement("meta");
    m.name = "theme-color";
    m.content = theme === "dark" ? PALETTE_INK : PALETTE_PAPER;
    m.setAttribute("data-explicit-theme", "");
    document.head.insertBefore(m, document.head.firstChild);
  }
}
