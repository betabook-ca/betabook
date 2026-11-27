import type { paths } from "@/spa/generated/api";

/** Upload limit enforced by the Worker after the picker crops the source. */
const MAX_PROFILE_PHOTO_BYTES = 3 * 1024 * 1024;

/** What the picker will open, which is a different question: the photo a
 * climber chooses is cropped and re-encoded to a ~60 KB square before
 * anything is uploaded, so a 12 MP phone photo is perfectly fine here. The
 * cap exists only so the browser is never asked to decode something absurd.
 * Comfortably inside the Images binding's own 20 MB input limit as well. */
export const MAX_SOURCE_PHOTO_BYTES = 16 * 1024 * 1024;

export const ACCEPTED_PROFILE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const AVATAR_ROUTE = "/api/avatars/{key}" satisfies keyof paths;
const PROFILE_PHOTO_PATH_PREFIX = AVATAR_ROUTE.slice(0, -"{key}".length);
const MB = 1024 * 1024;
export const PROFILE_PHOTO_TOO_LARGE_MESSAGE = `That photo is too large — pick one under ${MAX_PROFILE_PHOTO_BYTES / MB} MB.`;
export const SOURCE_PHOTO_TOO_LARGE_MESSAGE = `That photo is too large — pick one under ${MAX_SOURCE_PHOTO_BYTES / MB} MB.`;
export const PROFILE_PHOTO_WRONG_TYPE_MESSAGE = "Profile photos must be a JPEG, PNG or WebP image.";
const PROFILE_PHOTO_UNREADABLE_MESSAGE =
  "That file doesn't look like an image we can read. Try a JPEG, PNG or WebP.";

/** `<userId>/<32 hex characters>.webp`. Matched before any R2 read: the
 * serving route builds its key from URL segments, and a strict shape is what
 * keeps a crafted path from reaching the bucket. */
const KEY_PATTERN = /^[\w-]{1,64}\/[\da-f]{32}\.webp$/;

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

/** The same question for the photo the climber picked, before cropping. */
export function sourcePhotoProblem(file: File): string | null {
  return photoProblem(file, MAX_SOURCE_PHOTO_BYTES, SOURCE_PHOTO_TOO_LARGE_MESSAGE);
}

function photoProblem(file: File, maxBytes: number, tooLarge: string): string | null {
  if (file.size === 0) return PROFILE_PHOTO_UNREADABLE_MESSAGE;
  if (file.size > maxBytes) return tooLarge;
  if (!ACCEPTED_PROFILE_PHOTO_TYPES.some((type) => type === file.type))
    return PROFILE_PHOTO_WRONG_TYPE_MESSAGE;
  return null;
}
