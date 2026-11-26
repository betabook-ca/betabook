"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False on the server and during hydration, true otherwise — gates
 * rendering client-resolved state (session, theme, etc.) so the server and
 * first client render stay identical and hydration can't mismatch.
 *
 * React reads the server snapshot only while hydrating, so a component
 * mounted later (a navigation's loading state, an opened dialog) renders as
 * mounted from its first render instead of flashing its server-shaped
 * fallback for a frame. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
