import { getCloudflareEnv } from "@/lib/cloudflare-env";

/** Whether the recap's Dec 1 – Jan 14 window is forced open, for local
 * testing. Set `YEAR_REVIEW_ALWAYS_OPEN=true` in `.dev.vars`; production
 * leaves it unset. */
export async function yearReviewAlwaysOpen(): Promise<boolean> {
  const env = await getCloudflareEnv();
  return env.YEAR_REVIEW_ALWAYS_OPEN === "true";
}
