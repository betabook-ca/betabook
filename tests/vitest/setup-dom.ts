// oxlint-disable-next-line import/no-unassigned-import -- registers Vitest DOM matchers and their types
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  // jsdom has no layout or scrolling. Keyboard selection still runs the real
  // component effect; Playwright owns scroll position and viewport assertions.
  Element.prototype.scrollIntoView = vi.fn<Element["scrollIntoView"]>();
  // Resize observers are used by truncation/overlay primitives. These tests
  // never invent dimensions; overflow and overlay geometry stay in Playwright.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      public observe = vi.fn<ResizeObserver["observe"]>();
      public unobserve = vi.fn<ResizeObserver["unobserve"]>();
      public disconnect = vi.fn<ResizeObserver["disconnect"]>();
    },
  );
});

// Vitest globals are disabled, so register React cleanup explicitly.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
