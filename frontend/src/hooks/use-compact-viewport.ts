"use client";

import { useSyncExternalStore } from "react";

import { onVisualViewportChange, visualViewportHeight } from "@/lib/visual-viewport";

// A 375x812 phone drops to about 470px with a keyboard up, and a 402x874
// one to about 530px. The shortest phone in portrait without a keyboard
// still clears 600px. Landscape phones fall below it too, which wants the
// same treatment.
export const COMPACT_VIEWPORT_HEIGHT = 600;

const isCompact = () => visualViewportHeight() < COMPACT_VIEWPORT_HEIGHT;
const serverSnapshot = () => false;

/** True when there isn't enough height to spend on chrome. Surfaces that
 * stack filters above a scrolling list collapse them when this is set.
 *
 * `false` on the server and during hydration. The overlays using it only
 * open on a click, by which point the real measurement has landed. */
export function useCompactViewport(): boolean {
  return useSyncExternalStore(onVisualViewportChange, isCompact, serverSnapshot);
}
