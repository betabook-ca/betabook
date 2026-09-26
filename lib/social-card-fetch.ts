import { recapCoverImagePath } from "@/lib/recap-share";
import type { SocialCardPeriod } from "@/lib/social-card";

/** Keep image fetches outside the dialog so Storybook can replace the
 * `next/og` routes with fixture PNGs. */
export async function fetchStatsCardImage(userId: string, period: SocialCardPeriod): Promise<Blob> {
  const response = await fetch(`/api/og/stats-card/${userId}?period=${period}`);
  if (!response.ok) throw new Error("Couldn't generate the stats card image");
  return response.blob();
}

/** Public cover image for a prepared, frozen recap. The bearer token is
 * checked by the route rather than sending it to an image optimizer. */
export async function fetchRecapCoverImage(token: string): Promise<Blob> {
  const response = await fetch(recapCoverImagePath(token), { cache: "no-store" });
  if (!response.ok) throw new Error("Couldn't generate the recap cover image");
  return response.blob();
}
