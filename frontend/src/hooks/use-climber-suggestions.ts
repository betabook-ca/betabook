"use client";

import { useEffect, useState } from "react";

import type { SuggestedClimberRow } from "@/lib/community-types";
import { fetchApi } from "@/spa/lib/api";

/** Leaving the empty climber search drops loaded suggestions, so returning never offers
 * Add friend for someone the viewer has requested since. */
export function useClimberSuggestions(
  enabled: boolean,
  initial: SuggestedClimberRow[] | null,
): SuggestedClimberRow[] {
  const [climbers, setClimbers] = useState(enabled ? initial : null);
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    setClimbers(null);
  }
  useEffect(() => {
    if (!enabled || climbers) return;
    const controller = new AbortController();
    async function load() {
      const page = await fetchApi("/api/friends/suggestions", {
        signal: controller.signal,
        sessionEvents: true,
      });
      if (!controller.signal.aborted) setClimbers(page.climbers);
    }
    load().catch(() => {});
    return () => controller.abort();
  }, [enabled, climbers]);
  return enabled ? (climbers ?? []) : [];
}
