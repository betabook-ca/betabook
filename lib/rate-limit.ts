import { getCloudflareEnv } from "@/lib/cloudflare-env";

export async function allowFriendshipWrite(key: string): Promise<boolean> {
  const env = await getCloudflareEnv();
  return (await env.FRIENDSHIP_RATE_LIMITER.limit({ key })).success;
}

/** True while `key` is still under the /contact limit set in wrangler.jsonc.
 *
 * Its own module rather than a helper inside the action, so tests can stub
 * the decision without also having to stand in for the Worker's bindings.
 * Miniflare implements the binding for real, so `pnpm dev` and `vitest`
 * throttle the same way a deployed Worker does — with per-process counters
 * instead of per-colo ones.
 */
export async function allowContactSubmission(key: string): Promise<boolean> {
  const env = await getCloudflareEnv();
  return (await env.CONTACT_RATE_LIMITER.limit({ key })).success;
}

export async function allowJournalWrite(key: string): Promise<boolean> {
  const env = await getCloudflareEnv();
  return (await env.JOURNAL_RATE_LIMITER.limit({ key })).success;
}

/** Saved climb lists, apart from the journal: building a list is many quick
 * adds in a row from a dialog that stays open, which would drain the
 * journal's 20 a minute and then block journal writes too. */
export async function allowClimbListWrite(key: string): Promise<boolean> {
  const env = await getCloudflareEnv();
  return (await env.CLIMB_LIST_RATE_LIMITER.limit({ key })).success;
}

/** Error-page reports from browsers, keyed by address: the endpoint takes
 * signed-out reports too, so there is no user to key on. */
export async function allowClientErrorReport(key: string): Promise<boolean> {
  const env = await getCloudflareEnv();
  return (await env.CLIENT_ERROR_RATE_LIMITER.limit({ key })).success;
}

/** The one limit here that guards a budget rather than the database: each
 * upload spends an Images transformation from a monthly free allowance and
 * two R2 operations. */
export async function allowProfilePhotoWrite(key: string): Promise<boolean> {
  const env = await getCloudflareEnv();
  return (await env.PROFILE_PHOTO_RATE_LIMITER.limit({ key })).success;
}
