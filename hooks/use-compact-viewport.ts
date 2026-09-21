"use client";

import { useEffect, useState } from "react";

import { onVisualViewportChange, visualViewportHeight } from "@/lib/visual-viewport";

// A 375x812 phone drops to about 470px with a keyboard up, and a 402x874
// one to about 530px. The shortest phone in portrait without a keyboard
// still clears 600px. Landscape phones fall below it too, which wants the
// same treatment.
export const COMPACT_VIEWPORT_HEIGHT = 600;

/** True when there isn't enough height to spend on chrome. Surfaces that
 * stack filters above a scrolling list collapse them when this is set.
 *
 * Starts `false` so the server and the first client render agree. The
 * overlays using it only open on a click, by which point the real
 * measurement has landed. */
export function useCompactViewport(maxHeight: number = COMPACT_VIEWPORT_HEIGHT): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    function measure() {
      setCompact(visualViewportHeight() < maxHeight);
    }
    measure();
    return onVisualViewportChange(measure);
  }, [maxHeight]);

  return compact;
}
