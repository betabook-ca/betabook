import type { SocialCardPeriod } from "@/lib/social-card";

/** The one network boundary `SocialCardDialog` crosses — split out so a
 * story can mock it the same way `fetchAreaSuggestions` is mocked (see
 * .storybook/mocks/), since the real route renders through `next/og`, which
 * has nothing to run against in a static Storybook preview. */
export async function fetchStatsCardImage(userId: string, period: SocialCardPeriod): Promise<Blob> {
  const response = await fetch(`/api/og/stats-card/${userId}?period=${period}`);
  if (!response.ok) throw new Error("Couldn't generate the stats card image");
  return response.blob();
}
