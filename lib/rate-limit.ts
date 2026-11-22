/** Each `allow*` is true while `key` is still under that binding's limit, set
 * in wrangler.jsonc.
 *
 * Its own module rather than helpers inside the actions, so tests can stub a
 * decision without also having to stand in for the Worker's bindings.
 * Miniflare implements the bindings for real, so `pnpm dev` and `vitest`
 * throttle the same way a deployed Worker does — with per-process counters
 * instead of per-colo ones.
 */
import { getCloudflareEnv } from "@/lib/cloudflare-env";

type RateLimiterBinding =
  | "CONTACT_RATE_LIMITER"
  | "JOURNAL_RATE_LIMITER"
  | "FRIENDSHIP_RATE_LIMITER"
  | "PROFILE_PHOTO_RATE_LIMITER"
  | "CLIMB_LIST_RATE_LIMITER";

async function allow(binding: RateLimiterBinding, key: string): Promise<boolean> {
  const env = await getCloudflareEnv();
  return (await env[binding].limit({ key })).success;
}

export function allowFriendshipWrite(key: string): Promise<boolean> {
  return allow("FRIENDSHIP_RATE_LIMITER", key);
}

export function allowContactSubmission(key: string): Promise<boolean> {
  return allow("CONTACT_RATE_LIMITER", key);
}

export function allowJournalWrite(key: string): Promise<boolean> {
  return allow("JOURNAL_RATE_LIMITER", key);
}

/** Saved climb lists, apart from the journal: building a list is many quick
 * adds in a row from a dialog that stays open, which would drain the
 * journal's 20 a minute and then block journal writes too. */
export function allowClimbListWrite(key: string): Promise<boolean> {
  return allow("CLIMB_LIST_RATE_LIMITER", key);
}

/** The one limit here that guards a budget rather than the database: each
 * upload spends an Images transformation from a monthly free allowance and
 * two R2 operations. */
export function allowProfilePhotoWrite(key: string): Promise<boolean> {
  return allow("PROFILE_PHOTO_RATE_LIMITER", key);
}
