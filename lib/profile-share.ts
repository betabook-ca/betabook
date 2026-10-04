import { parseShareToken } from "@/lib/share-token";

export const PROFILE_SHARE_PARAM = "share";

/** Sends a signed-out share link previews; the rest stays behind sign-up. */
export const SHARED_PROFILE_SENDS = 5;
/** Max sends on a shared trip page. Higher than the profile's because a trip can
 * be long and the page has no pagination. */
export const SHARED_TRIP_SENDS = 50;

export function withProfileShare(path: string, token: string): string {
  return `${path}?${PROFILE_SHARE_PARAM}=${token}`;
}

export function profileSharePath(userId: string, token: string): string {
  return withProfileShare(`/users/${userId}`, token);
}

/** Parses the share link out of a return path after sign-in. Only matches pages
 * a share link can open: the profile, the trips list and a trip. */
export function profileShareFromPath(path: string | undefined) {
  const [pathname = "", query = ""] = path?.split("#")[0].split("?") ?? [];
  const userId = /^\/users\/([^/]+)(?:\/trips(?:\/\d+)?)?$/.exec(pathname)?.[1];
  const token = parseShareToken(new URLSearchParams(query).get(PROFILE_SHARE_PARAM));
  return userId && token ? { userId, token } : null;
}
