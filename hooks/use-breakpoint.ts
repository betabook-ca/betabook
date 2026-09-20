"use client";

import { useState } from "react";

import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";

export type Breakpoint = "sm" | "md" | "lg";

// Tailwind v4's default breakpoints — matchMedia takes rem units and, like
// Tailwind's own media queries, resolves them against the initial font size,
// so these track the sm:/md:/lg: classes exactly.
//
// `md` is the app's own mobile/desktop line: it is where the tab bar appears
// (app-tab-bar.tsx) and where the mobile menu closes (app-menu.tsx). Overlays
// use the same one, so the app never disagrees with itself about which side
// of the divide a viewer is on.
export const BREAKPOINT_QUERY: Record<Breakpoint, string> = {
  sm: "(min-width: 40rem)",
  md: "(min-width: 48rem)",
  lg: "(min-width: 64rem)",
};

/** `undefined` on the server and during hydration, then live viewport state.
 * Resolved in a layout effect so the first client value commits before paint
 * — no flash of the wrong variant.
 *
 * Callers that render different markup per side must handle `undefined`
 * rather than treating it as `false`; the server has no viewport, and
 * guessing produces a hydration mismatch.
 *
 * `live: false` re-reads the viewport once and then holds that answer until
 * it is true again. Callers that swap one subtree for another across the
 * breakpoint use it to pin the answer for the life of an interaction: a
 * phone rotated mid-form would otherwise unmount the form and lose every
 * field the viewer had filled in. */
export function useIsAtLeast(
  breakpoint: Breakpoint,
  { live = true }: { live?: boolean } = {},
): boolean | undefined {
  const [matches, setMatches] = useState<boolean | undefined>(undefined);

  useIsomorphicLayoutEffect(() => {
    // jsdom has no media queries at all, so component tests opt in per case
    // (see test/viewport.ts); without a stub every query reads as unmatched.
    const query = window.matchMedia?.(BREAKPOINT_QUERY[breakpoint]);
    if (!query) return;
    const update = () => setMatches(query.matches);
    update();
    if (!live) return;
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [breakpoint, live]);

  return matches;
}
