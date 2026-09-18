/** Everything about an uploaded profile photo that touches no binding: what
 * the app accepts, what it stores, and how a stored object travels in
 * `user.image`.
 *
 * One object per climber, always 256×256 WebP. That is four times the
 * largest avatar the app renders (64 px), so no size variants are needed,
 * and it holds the whole feature inside R2's free tier: ~20 KB a photo is
 * roughly 400,000 climbers in 10 GB.
 *
 * `user.image` stays the single pointer to whatever photo is showing. It
 * already held either a Google URL or nothing, and an uploaded photo takes
 * the same slot as `/api/avatars/<key>`, so every existing climber query
 * keeps working and "remove the photo" keeps meaning one thing. */

export const PROFILE_PHOTO_PIXELS = 256;
export const PROFILE_PHOTO_QUALITY = 80;
export const PROFILE_PHOTO_CONTENT_TYPE = "image/webp";

/** A week, and immutable: the key is a digest of the stored bytes, so a
 * given URL's content can never change — a re-crop is a new key. Not a year,
 * because a removed photo's object is deleted while caches downstream may
 * still hold it, and that window should end on its own. */
export const PROFILE_PHOTO_CACHE_CONTROL = "public, max-age=604800, immutable";

/** What the upload action accepts. The picker resizes and crops before
 * uploading, so a real submission is ~80 KB; this cap is for anything that
 * skips the picker, and stays under the server action body limit configured
 * in next.config.ts. */
export const MAX_PROFILE_PHOTO_BYTES = 3 * 1024 * 1024;
const ACCEPTED_PROFILE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const PROFILE_PHOTO_PATH_PREFIX = "/api/avatars/";
export const PROFILE_PHOTO_TOO_LARGE_MESSAGE = "That photo is too large — pick one under 3 MB.";
export const PROFILE_PHOTO_WRONG_TYPE_MESSAGE = "Profile photos must be a JPEG, PNG or WebP image.";
export const PROFILE_PHOTO_UNREADABLE_MESSAGE =
  "That file doesn't look like an image we can read. Try a JPEG, PNG or WebP.";
/** The upload action's own refusals live here rather than beside it: a
 * `"use server"` module may export nothing but async functions, and a plain
 * `export const` there invalidates every export in it. */
export const PROFILE_PHOTO_MISSING_MESSAGE = "Choose a photo to upload.";
export const PROFILE_PHOTO_TOO_MANY_MESSAGE =
  "That's a lot of photos at once — try again in a minute.";

/** `<userId>/<32 hex characters>.webp`. Matched before any R2 read: the
 * serving route builds its key from URL segments, and a strict shape is what
 * keeps a crafted path from reaching the bucket. */
const KEY_PATTERN = /^[\w-]{1,64}\/[\da-f]{32}\.webp$/;

type AcceptedProfilePhotoType = (typeof ACCEPTED_PROFILE_PHOTO_TYPES)[number];

export function isProfilePhotoKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export function profilePhotoPath(key: string): string {
  return `${PROFILE_PHOTO_PATH_PREFIX}${key}`;
}

/** The object key behind a stored `user.image`, or null when the value is
 * empty, a Google URL, or anything else this app did not write. */
export function profilePhotoKeyFromImage(image?: string | null): string | null {
  if (!image?.startsWith(PROFILE_PHOTO_PATH_PREFIX)) return null;
  const key = image.slice(PROFILE_PHOTO_PATH_PREFIX.length);
  return isProfilePhotoKey(key) ? key : null;
}

/** Content-addressed from a digest of the stored bytes: the same photo
 * cropped the same way is the same key, a different crop is a new one, and
 * no URL ever changes meaning — which is what lets the response be cached as
 * immutable. Half of a SHA-256 is 128 bits, far past collision concern for
 * one object per climber. */
export function profilePhotoKey(userId: string, digest: ArrayBuffer): string {
  const hex = [...new Uint8Array(digest).slice(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${userId}/${hex}.webp`;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** The format the bytes actually are, ignoring the browser-supplied type on
 * the upload. Null for anything else, including a renamed HEIC: Cloudflare
 * only ingests those on an Enterprise plan, so it earns a clear message
 * rather than a transform failure. */
export function sniffImageType(bytes: Uint8Array): AcceptedProfilePhotoType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return "image/webp";
  return null;
}

/** Why this upload can't be accepted, as the message the form shows
 * verbatim, or null when it can. Checks the declared type and size only —
 * the bytes are sniffed once they are in hand. */
export function profilePhotoProblem(file: File): string | null {
  if (file.size === 0) return PROFILE_PHOTO_UNREADABLE_MESSAGE;
  if (file.size > MAX_PROFILE_PHOTO_BYTES) return PROFILE_PHOTO_TOO_LARGE_MESSAGE;
  if (!ACCEPTED_PROFILE_PHOTO_TYPES.includes(file.type as AcceptedProfilePhotoType))
    return PROFILE_PHOTO_WRONG_TYPE_MESSAGE;
  return null;
}
