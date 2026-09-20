import { vi } from "vitest";

/** jsdom doesn't implement matchMedia at all, so components that branch on
 * a breakpoint read the mobile side by default. Call this to test the other
 * one.
 *
 * Width only. What a sheet or centered dialog actually looks like is a
 * geometry question for Playwright, which runs untagged specs at both 375
 * and 1024. */
export function stubViewport(side: "mobile" | "desktop") {
  const desktop = side === "desktop";
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    // Only answers width queries. Everything else — (pointer: coarse),
    // (display-mode: standalone), (prefers-reduced-motion) — reads as
    // unmatched, so a test that needs one stubs it itself rather than
    // inheriting an answer this helper never meant to give.
    matches: media.includes("min-width") ? desktop : false,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
  }));
}
