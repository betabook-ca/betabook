import { getBaseUrl } from "@/lib/app-url";
import { profilePhotoKeyFromImage, profilePhotoPath } from "@/lib/profile-photo";

/** Compact, deterministic initials for profile-photo fallbacks. Names with
 * multiple words use the outside pair (so middle names do not crowd the
 * avatar); a single-word name uses its first two characters. */
export function getUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return "?";

  const first = Array.from(parts[0]);
  const initials =
    parts.length === 1
      ? first.slice(0, 2).join("")
      : `${first[0] ?? ""}${Array.from(parts.at(-1) ?? "")[0] ?? ""}`;

  return initials.toUpperCase();
}

/** The photo to render for a stored `user.image`, or null for initials.
 *
 * Two kinds share that column (see lib/profile-photo.ts). An uploaded photo
 * is already exactly the size every avatar needs, so it is served as-is —
 * running 256 px of WebP through the image optimizer would spend Worker CPU
 * to produce the same bytes. A Google URL keeps going through next/image,
 * whose allowlist in next.config.ts is pinned to that one host. */
export function getAvatarPhoto(image?: string | null): { url: string; optimize: boolean } | null {
  const key = profilePhotoKeyFromImage(image);
  if (key) return { url: profilePhotoPath(key), optimize: false };

  const google = getGoogleProfileImageUrl(image);
  return google === null ? null : { url: google, optimize: true };
}

/** `getAvatarPhoto`'s URL, made absolute — what an OG card needs, since
 * satori fetches image sources itself rather than through the app's own
 * server (which a relative `/api/avatars/<key>` path assumes). A Google URL
 * is already absolute and passes through unchanged. */
export async function resolveAvatarUrl(image?: string | null): Promise<string | null> {
  const avatar = getAvatarPhoto(image);
  return avatar ? new URL(avatar.url, await getBaseUrl()).href : null;
}

/** Only pass the Google profile-photo URLs the app is configured to optimize
 * to next/image. Better Auth's field is nullable but older/local rows may
 * contain placeholders or malformed values; those should use initials. */
export function getGoogleProfileImageUrl(image?: string | null): string | null {
  if (!image) return null;

  try {
    const url = new URL(image);
    if (url.protocol !== "https:" || url.hostname !== "lh3.googleusercontent.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}
