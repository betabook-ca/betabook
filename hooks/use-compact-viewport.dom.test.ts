import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { COMPACT_VIEWPORT_HEIGHT, useCompactViewport } from "./use-compact-viewport";

type Listener = () => void;

/** jsdom has no visual viewport. This stands in for one so the hook's own
 * subscription and threshold are exercised; the rendered result of going
 * compact is a geometry question and stays in Playwright. */
function stubVisualViewport(height: number) {
  const listeners = new Map<string, Set<Listener>>();
  const viewport = {
    height,
    offsetTop: 0,
    addEventListener: (type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(listener);
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    },
  };
  Object.defineProperty(window, "visualViewport", {
    value: viewport,
    configurable: true,
    writable: true,
  });
  return {
    resizeTo(next: number) {
      viewport.height = next;
      act(() => {
        for (const listener of listeners.get("resize") ?? []) listener();
      });
    },
    listenerCount: () =>
      (listeners.get("resize")?.size ?? 0) + (listeners.get("scroll")?.size ?? 0),
  };
}

beforeEach(() => {
  vi.stubGlobal("innerHeight", 812);
});

afterEach(() => {
  Reflect.deleteProperty(window, "visualViewport");
});

it("stays roomy when the visible viewport is tall", () => {
  stubVisualViewport(812);
  const { result } = renderHook(() => useCompactViewport());
  expect(result.current).toBe(false);
});

it("goes compact once a keyboard takes the bottom of the viewport", () => {
  const viewport = stubVisualViewport(812);
  const { result } = renderHook(() => useCompactViewport());
  expect(result.current).toBe(false);

  viewport.resizeTo(470);
  expect(result.current).toBe(true);

  viewport.resizeTo(812);
  expect(result.current).toBe(false);
});

it("treats the threshold as exclusive", () => {
  stubVisualViewport(COMPACT_VIEWPORT_HEIGHT);
  const { result } = renderHook(() => useCompactViewport());
  expect(result.current).toBe(false);
});

it("falls back to the layout viewport where there is no visual viewport", () => {
  vi.stubGlobal("innerHeight", 400);
  const { result } = renderHook(() => useCompactViewport());
  expect(result.current).toBe(true);
});

it("drops its listeners on unmount", () => {
  const viewport = stubVisualViewport(812);
  const { unmount } = renderHook(() => useCompactViewport());
  expect(viewport.listenerCount()).toBeGreaterThan(0);

  unmount();
  expect(viewport.listenerCount()).toBe(0);
});
