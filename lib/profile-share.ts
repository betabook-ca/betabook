import { parseShareToken } from "@/lib/share-token";

export const PROFILE_SHARE_PARAM = "share";

/** Sends a signed-out share link previews; the rest stays behind sign-up. */
export const SHARED_PROFILE_SENDS = 5;

// Matches lower(hex(randomblob(16))) in drizzle/migrations/0041_profile_share_links.sql.
const SHORT_SHARE_TOKEN = /^[A-Za-z0-9_-]{22}$/;

export function parseProfileShareToken(value: unknown): string | null {
  return parseShareToken(value);
}

export function profileSharePath(userId: string, token: string): string {
  return `/users/${userId}?${PROFILE_SHARE_PARAM}=${token}`;
}

/** Compatibility for compact profile links sent by earlier image captions.
 * Keep decoding them while their underlying profile token remains current. */
export function profileShareShortPath(token: string): string {
  if (!parseProfileShareToken(token)) throw new Error("Invalid profile share token");
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

/** The share link a sign-in continuation came from. Only a profile's own
 * path counts, since no other page shows the invitation. */
export function profileShareFromPath(path: string | undefined) {
  const [pathname = "", query = ""] = path?.split("#")[0].split("?") ?? [];
  const userId = /^\/users\/([^/]+)$/.exec(pathname)?.[1];
  const token = parseProfileShareToken(new URLSearchParams(query).get(PROFILE_SHARE_PARAM));
  return userId && token ? { userId, token } : null;
}
