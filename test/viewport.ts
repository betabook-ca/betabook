import { vi } from "vitest";

/** jsdom has no media queries, so `window.matchMedia` is missing entirely
 * rather than merely inert. Components that branch on a breakpoint read the
 * mobile side by default; call this to make a case assert the other one.
 *
 * Only the width is modelled. Geometry — what a sheet or a centered dialog
 * actually looks like at a viewport — stays in Playwright, which runs every
 * untagged spec at both 375 and 1024.
 */
export function stubViewport(side: "mobile" | "desktop") {
  const desktop = side === "desktop";
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    // Every breakpoint query in the app is a `min-width`, so one answer per
    // side is enough: desktop matches them all, mobile matches none.
    matches: desktop,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
  }));
}
