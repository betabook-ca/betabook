import { getCloudflareContext } from "@opennextjs/cloudflare";

/** The site's own origin for links shared outside the app.
 *
 * better-auth builds its verification/reset URLs from this same value, so
 * there's no second thing to configure — and a preview deployment's links
 * point at the preview rather than at production. */
export async function getBaseUrl() {
  const { env } = await getCloudflareContext({ async: true });
  return env.BETTER_AUTH_URL.replace(/\/$/, "");
}
