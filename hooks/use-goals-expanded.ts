"use client";

import { useSectionExpanded } from "./use-section-expanded";

export function useGoalsExpanded(ownerId: string): [boolean, (expanded: boolean) => void] {
  return useSectionExpanded(`betabook:goals:${ownerId}:collapsed`);
}
