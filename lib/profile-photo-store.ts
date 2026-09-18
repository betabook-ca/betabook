import { getCloudflareContext } from "@opennextjs/cloudflare";

import { ActionError } from "@/lib/action-result";
import {
  isProfilePhotoKey,
  PROFILE_PHOTO_CACHE_CONTROL,
  PROFILE_PHOTO_CONTENT_TYPE,
  PROFILE_PHOTO_PIXELS,
  PROFILE_PHOTO_QUALITY,
  PROFILE_PHOTO_UNREADABLE_MESSAGE,
  profilePhotoKey,
  sniffImageType,
} from "@/lib/profile-photo";

/** The binding side of profile photos: re-encode an upload, put it, read it
 * back, delete what it replaced. Bindings are passed in rather than read
 * here, like lib/catalog-export.ts — only `getProfilePhotoStore` is
 * request-path code, and tests then drive the real Miniflare bindings
 * without standing in for the request context. */

export type ProfilePhotoStore = { bucket: R2Bucket; images: ImagesBinding };

export const PROFILE_PHOTO_UNAVAILABLE_MESSAGE =
  "Photo uploads are unavailable right now. Please try again later.";
export const PROFILE_PHOTO_FAILED_MESSAGE =
  "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.";

/** Serving a photo needs the bucket alone, so it stays available even if the
 * Images binding is missing — photos already stored must keep rendering. */
export async function getProfilePhotoBucket(): Promise<R2Bucket | null> {
  const { env } = await getCloudflareContext({ async: true });
  // Widened deliberately: a Worker deployed before this binding landed would
  // not have it, and a TypeError would reach the climber as "Something went
  // wrong" instead of a sentence they can act on.
  const bucket: R2Bucket | undefined = env.PROFILE_PHOTOS;
  if (!bucket) console.warn("PROFILE_PHOTOS is not bound — profile photos unavailable");
  return bucket ?? null;
}

export async function getProfilePhotoStore(): Promise<ProfilePhotoStore | null> {
  const bucket = await getProfilePhotoBucket();
  const { env } = await getCloudflareContext({ async: true });
  const images: ImagesBinding | undefined = env.IMAGES;
  if (!bucket || !images) {
    console.warn("IMAGES is not bound — profile photo uploads unavailable");
    return null;
  }
  return { bucket, images };
}

/** `Uint8Array<ArrayBuffer>` rather than the default `ArrayBufferLike`: the
 * platform's `BodyInit` and `BufferSource` both exclude a view that might be
 * backed by a `SharedArrayBuffer`. */
type ImageBytes = Uint8Array<ArrayBuffer>;

function stream(bytes: ImageBytes): ReadableStream<Uint8Array> {
  return new Response(bytes).body as ReadableStream<Uint8Array>;
}

/** Re-encodes the upload to the one size and format the app stores, then
 * writes it under a key derived from the result. The picker has already
 * cropped to a square, so this is a resize rather than a second opinion on
 * framing — but `fit: "cover"` stays, because a submission that skipped the
 * picker must not stretch. Re-encoding is also the sanitizing step: EXIF
 * (including GPS) and anything else riding along in the container do not
 * survive it. */
export async function storeProfilePhoto(
  store: ProfilePhotoStore,
  userId: string,
  file: File,
): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (sniffImageType(bytes) === null) throw new ActionError(PROFILE_PHOTO_UNREADABLE_MESSAGE);

  let encoded: ImageBytes;
  try {
    const result = await store.images
      .input(stream(bytes))
      .transform({ width: PROFILE_PHOTO_PIXELS, height: PROFILE_PHOTO_PIXELS, fit: "cover" })
      .output({ format: PROFILE_PHOTO_CONTENT_TYPE, quality: PROFILE_PHOTO_QUALITY });
    encoded = new Uint8Array(await new Response(result.image()).arrayBuffer());
  } catch (error) {
    // Also where a month's free transformations running out surfaces, so
    // the message has to make sense for a climber, and the log for us.
    console.error("Profile photo transform failed", error);
    throw new ActionError(PROFILE_PHOTO_FAILED_MESSAGE);
  }

  const key = profilePhotoKey(userId, await crypto.subtle.digest("SHA-256", encoded));
  await store.bucket.put(key, encoded, {
    httpMetadata: {
      contentType: PROFILE_PHOTO_CONTENT_TYPE,
      cacheControl: PROFILE_PHOTO_CACHE_CONTROL,
    },
  });
  return key;
}

export async function readProfilePhoto(
  bucket: R2Bucket,
  key: string,
): Promise<R2ObjectBody | null> {
  if (!isProfilePhotoKey(key)) return null;
  return bucket.get(key);
}

/** Best effort: a photo nobody links to costs ~20 KB, and failing a climber's
 * upload over its predecessor's funeral would be the worse trade. */
export async function deleteProfilePhoto(bucket: R2Bucket, key: string): Promise<void> {
  try {
    await bucket.delete(key);
  } catch (error) {
    console.error("Couldn't delete a replaced profile photo", error);
  }
}

/** Every photo this climber has ever had, for account deletion. Normally one
 * object; the prefix sweep is what makes that a fact rather than a hope,
 * since a crash between the put and the D1 write can orphan one. */
export async function deleteProfilePhotosForUser(bucket: R2Bucket, userId: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix: `${userId}/`, cursor });
    if (listed.objects.length > 0) await bucket.delete(listed.objects.map((object) => object.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}
