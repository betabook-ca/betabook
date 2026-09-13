"use client";

import { useEffect, useState } from "react";

import type { SuggestedClimberRow } from "@/db/queries";
import { apiFetch } from "@/lib/api-client";

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
      const response = await apiFetch("/api/friends/suggestions", { signal: controller.signal });
      if (!response.ok) return;
      const page = (await response.json()) as { climbers: SuggestedClimberRow[] };
      if (!controller.signal.aborted) setClimbers(page.climbers);
    }
    load().catch(() => {});
    return () => controller.abort();
  }, [enabled, climbers]);
  return enabled ? (climbers ?? []) : [];
}
