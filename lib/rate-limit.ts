import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function allowFriendshipWrite(key: string): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  return (await env.FRIENDSHIP_RATE_LIMITER.limit({ key })).success;
}

/** True while `key` is still under the /contact limit set in wrangler.jsonc.
 *
 * Its own module rather than a helper inside the action, so tests can stub
 * the decision without also having to stand in for `getCloudflareContext`.
 * Miniflare implements the binding for real, so `next dev` and `vitest`
 * throttle the same way a deployed Worker does — with per-process counters
 * instead of per-colo ones.
 */
export async function allowContactSubmission(key: string): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  return (await env.CONTACT_RATE_LIMITER.limit({ key })).success;
}

export async function allowJournalWrite(key: string): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  return (await env.JOURNAL_RATE_LIMITER.limit({ key })).success;
}

/** The one limit here that guards a budget rather than the database: each
 * upload spends an Images transformation from a monthly free allowance and
 * two R2 operations. */
export async function allowProfilePhotoWrite(key: string): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  return (await env.PROFILE_PHOTO_RATE_LIMITER.limit({ key })).success;
}
