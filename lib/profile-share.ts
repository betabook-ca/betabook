import { parseShareToken } from "@/lib/share-token";

export const PROFILE_SHARE_PARAM = "share";

/** Sends a signed-out share link previews; the rest stays behind sign-up. */
export const SHARED_PROFILE_SENDS = 5;
/** Max sends on a shared trip page. Higher than the profile's because a trip can
 * be long and the page has no pagination. */
export const SHARED_TRIP_SENDS = 50;

// Matches lower(hex(randomblob(16))) in drizzle/migrations/0041_profile_share_links.sql.
const SHORT_SHARE_TOKEN = /^[A-Za-z0-9_-]{22}$/;

export function withProfileShare(path: string, token: string): string {
  return `${path}?${PROFILE_SHARE_PARAM}=${token}`;
}

export function profileSharePath(userId: string, token: string): string {
  return withProfileShare(`/users/${userId}`, token);
}

/** Compatibility for compact profile links sent by earlier image captions.
 * Keep decoding them while their underlying profile token remains current. */
export function profileShareShortPath(token: string): string {
  if (!parseShareToken(token)) throw new Error("Invalid profile share token");
  let bytes = "";
  for (let i = 0; i < token.length; i += 2) {
    bytes += String.fromCharCode(Number.parseInt(token.slice(i, i + 2), 16));
  }
  return `/s/${btoa(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

export function parseProfileShareShortToken(value: unknown): string | null {
  if (typeof value !== "string" || !SHORT_SHARE_TOKEN.test(value)) return null;
  try {
    const bytes = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "==");
    if (bytes.length !== 16) return null;
    const token = Array.from(bytes, (byte) =>
      byte.charCodeAt(0).toString(16).padStart(2, "0"),
    ).join("");
    return profileShareShortPath(token) === `/s/${value}` ? token : null;
  } catch {
    return null;
  }
}

/** The personalized preview image for a share link — re-validates the token
 * on every fetch, so a reset or expired link falls back to the sitewide
 * image without the metadata that named this URL ever knowing. */
export function profileShareImagePath(token: string): string {
  return `/api/og/profile-share/${token}`;
}

/** Parses the share link out of a return path after sign-in. Only matches pages
 * a share link can open: the profile, the trips list and a trip. */
export function profileShareFromPath(path: string | undefined) {
  const [pathname = "", query = ""] = path?.split("#")[0].split("?") ?? [];
  const userId = /^\/users\/([^/]+)(?:\/trips(?:\/\d+)?)?$/.exec(pathname)?.[1];
  const token = parseShareToken(new URLSearchParams(query).get(PROFILE_SHARE_PARAM));
  return userId && token ? { userId, token } : null;
}
