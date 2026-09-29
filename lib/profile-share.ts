import { parseShareToken } from "@/lib/share-token";

export const PROFILE_SHARE_PARAM = "share";

/** Sends a signed-out share link previews; the rest stays behind sign-up. */
export const SHARED_PROFILE_SENDS = 5;
/** A trip can span a season, and a signed-out page takes no cursor. */
export const SHARED_TRIP_SENDS = 50;

export function withProfileShare(path: string, token: string): string {
  return `${path}?${PROFILE_SHARE_PARAM}=${token}`;
}

export function profileSharePath(userId: string, token: string): string {
  return withProfileShare(`/users/${userId}`, token);
}

/** The share link a sign-in continuation came from. Only the pages the link
 * opens count, the profile and its trips, since no other page shows the
 * invitation. */
export function profileShareFromPath(path: string | undefined) {
  const [pathname = "", query = ""] = path?.split("#")[0].split("?") ?? [];
  const userId = /^\/users\/([^/]+)(?:\/trips(?:\/\d+)?)?$/.exec(pathname)?.[1];
  const token = parseShareToken(new URLSearchParams(query).get(PROFILE_SHARE_PARAM));
  return userId && token ? { userId, token } : null;
}
