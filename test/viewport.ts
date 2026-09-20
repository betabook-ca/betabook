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
    // Every breakpoint query in the app is a min-width, so one answer per
    // side covers all of them.
    matches: desktop,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
  }));
}
