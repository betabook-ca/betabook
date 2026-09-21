"use client";

import { useState } from "react";

import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";

export type Breakpoint = "sm" | "md" | "lg";

// Tailwind v4's defaults. matchMedia takes rem units and resolves them
// against the initial font size, same as Tailwind's own media queries, so
// these track the sm:/md:/lg: classes exactly.
//
// `md` is the app's mobile/desktop line: the tab bar appears there
// (app-tab-bar.tsx), the mobile menu closes there (app-menu.tsx), and
// dialogs switch shape there.
export const BREAKPOINT_QUERY: Record<Breakpoint, string> = {
  sm: "(min-width: 40rem)",
  md: "(min-width: 48rem)",
  lg: "(min-width: 64rem)",
};

/** `undefined` until the client resolves it, then live viewport state. Runs
 * in a layout effect so the first real value commits before paint.
 *
 * Handle the `undefined` case rather than treating it as `false` — the
 * server has no viewport, and guessing causes a hydration mismatch.
 *
 * This always tracks the viewport. A caller that swaps one subtree for
 * another across the breakpoint should hold the answer in its own state for
 * the length of an interaction — see ResponsiveDialog. */
export function useIsAtLeast(breakpoint: Breakpoint): boolean | undefined {
  const [matches, setMatches] = useState<boolean | undefined>(undefined);

  useIsomorphicLayoutEffect(() => {
    // jsdom has no matchMedia at all, so tests opt in per case via
    // test/viewport.ts. Without a stub every query reads as unmatched.
    const query = window.matchMedia?.(BREAKPOINT_QUERY[breakpoint]);
    if (!query) return;
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [breakpoint]);

  return matches;
}
