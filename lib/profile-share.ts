export const PROFILE_SHARE_PARAM = "share";

// Matches lower(hex(randomblob(16))) in drizzle/migrations/0041_profile_share_links.sql.
const SHARE_TOKEN = /^[0-9a-f]{32}$/;

export function parseProfileShareToken(value: unknown): string | null {
  return typeof value === "string" && SHARE_TOKEN.test(value) ? value : null;
}

export function profileSharePath(userId: string, token: string): string {
  return `/users/${userId}?${PROFILE_SHARE_PARAM}=${token}`;
}

/** The share token in a sign-in continuation, so an account created from a
 * share link can record who invited it. */
export function profileShareTokenFromPath(path: string | undefined): string | null {
  const query = path?.split("#")[0].split("?")[1];
  return query ? parseProfileShareToken(new URLSearchParams(query).get(PROFILE_SHARE_PARAM)) : null;
}
