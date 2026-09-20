export const PROFILE_SHARE_PARAM = "share";

/** Sends a signed-out share link previews; the rest stays behind sign-up. */
export const SHARED_PROFILE_SENDS = 5;

// Matches lower(hex(randomblob(16))) in drizzle/migrations/0041_profile_share_links.sql.
const SHARE_TOKEN = /^[0-9a-f]{32}$/;

export function parseProfileShareToken(value: unknown): string | null {
  return typeof value === "string" && SHARE_TOKEN.test(value) ? value : null;
}

export function profileSharePath(userId: string, token: string): string {
  return `/users/${userId}?${PROFILE_SHARE_PARAM}=${token}`;
}

/** The personalized preview image for a share link — re-validates the token
 * on every fetch, so a reset or expired link falls back to the sitewide
 * image without the metadata that named this URL ever knowing. */
export function profileShareImagePath(token: string): string {
  return `/api/og/profile-share/${token}`;
}

/** The share link a sign-in continuation came from. Only a profile's own
 * path counts, since no other page shows the invitation. */
export function profileShareFromPath(path: string | undefined) {
  const [pathname = "", query = ""] = path?.split("#")[0].split("?") ?? [];
  const userId = /^\/users\/([^/]+)$/.exec(pathname)?.[1];
  const token = parseProfileShareToken(new URLSearchParams(query).get(PROFILE_SHARE_PARAM));
  return userId && token ? { userId, token } : null;
}
