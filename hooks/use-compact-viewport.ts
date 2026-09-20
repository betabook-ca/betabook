"use client";

import { useEffect, useState } from "react";

import { onVisualViewportChange, visualViewportHeight } from "@/lib/visual-viewport";

/** Below this the viewer is almost certainly looking past an open keyboard:
 * a 375x812 phone drops to roughly 470px with one up, while the shortest
 * phone in portrait without one still clears 600px. Landscape phones sit
 * under it too, which is the same problem and wants the same answer. */
export const COMPACT_VIEWPORT_HEIGHT = 600;

/** True when there is too little vertical room to spend it on chrome —
 * surfaces that stack filters above a result list collapse them instead.
 *
 * Starts `false` so the server and the first client render agree on the
 * roomy layout; the overlays that use it only open on a client interaction,
 * by which point the real measurement has committed. */
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
