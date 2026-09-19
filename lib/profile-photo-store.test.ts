import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import {
  PROFILE_PHOTO_CACHE_CONTROL,
  PROFILE_PHOTO_PIXELS,
  PROFILE_PHOTO_UNREADABLE_MESSAGE,
  profilePhotoKeyFromImage,
  profilePhotoPath,
} from "@/lib/profile-photo";
import {
  deletePreviousProfilePhoto,
  deleteProfilePhoto,
  deleteProfilePhotosForUser,
  PROFILE_PHOTO_FAILED_MESSAGE,
  readProfilePhoto,
  storeProfilePhoto,
} from "@/lib/profile-photo-store";
import { makePngFile, toStream } from "@/test/image-fixtures";

const store = { bucket: env.PROFILE_PHOTOS, images: env.IMAGES };

async function clearBucket() {
  const listed = await env.PROFILE_PHOTOS.list();
  if (listed.objects.length > 0)
    await env.PROFILE_PHOTOS.delete(listed.objects.map((object) => object.key));
}

beforeEach(async () => {
  await clearBucket();
});

it("stores a 256px WebP under a key derived from the stored bytes", async () => {
  const key = await storeProfilePhoto(store, "climber1", await makePngFile(400, 400));

  expect(key).toMatch(/^climber1\/[\da-f]{32}\.webp$/);
  const object = await env.PROFILE_PHOTOS.get(key);
  expect(object).not.toBeNull();
  expect(object?.httpMetadata?.contentType).toBe("image/webp");
  expect(object?.httpMetadata?.cacheControl).toBe(PROFILE_PHOTO_CACHE_CONTROL);

  const bytes = new Uint8Array(await object!.arrayBuffer());
  expect(await env.IMAGES.info(toStream(bytes))).toMatchObject({
    format: "image/webp",
    width: PROFILE_PHOTO_PIXELS,
    height: PROFILE_PHOTO_PIXELS,
  });
});

it("squares a portrait upload instead of stretching it", async () => {
  const key = await storeProfilePhoto(store, "climber1", await makePngFile(200, 600));
  const object = await env.PROFILE_PHOTOS.get(key);
  const info = await env.IMAGES.info(toStream(new Uint8Array(await object!.arrayBuffer())));

  expect(info).toMatchObject({ width: PROFILE_PHOTO_PIXELS, height: PROFILE_PHOTO_PIXELS });
});

it("keeps one climber's photos under their own prefix", async () => {
  const mine = await storeProfilePhoto(store, "climber1", await makePngFile(300, 300));
  const theirs = await storeProfilePhoto(store, "climber2", await makePngFile(300, 300));

  expect(mine.startsWith("climber1/")).toBe(true);
  expect(theirs.startsWith("climber2/")).toBe(true);
  // Same source photo, so the digest matches — the owner segment is what
  // keeps the objects distinct.
  expect(mine.split("/")[1]).toBe(theirs.split("/")[1]);
});

it("gives the same photo the same key and a re-crop a new one", async () => {
  const first = await storeProfilePhoto(store, "climber1", await makePngFile(300, 300));
  const again = await storeProfilePhoto(store, "climber1", await makePngFile(300, 300));
  const cropped = await storeProfilePhoto(store, "climber1", await makePngFile(120, 300));

  expect(again).toBe(first);
  expect(cropped).not.toBe(first);
});

it("refuses bytes that are not an image it can read", async () => {
  const notAnImage = new File([new TextEncoder().encode("<svg xmlns=''/>")], "photo.png", {
    type: "image/png",
  });

  await expect(storeProfilePhoto(store, "climber1", notAnImage)).rejects.toThrow(
    PROFILE_PHOTO_UNREADABLE_MESSAGE,
  );
  expect((await env.PROFILE_PHOTOS.list()).objects).toHaveLength(0);
});

it("reports a transform failure as advice, not an internal error", async () => {
  const failing = {
    bucket: env.PROFILE_PHOTOS,
    images: {
      input: () => ({
        transform: () => ({
          output: () => Promise.reject(new Error("IMAGES_TRANSFORM_LIMIT")),
        }),
      }),
    } as unknown as ImagesBinding,
  };
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});

  await expect(storeProfilePhoto(failing, "climber1", await makePngFile(300, 300))).rejects.toThrow(
    PROFILE_PHOTO_FAILED_MESSAGE,
  );
  expect(logged).toHaveBeenCalled();
  expect((await env.PROFILE_PHOTOS.list()).objects).toHaveLength(0);
  logged.mockRestore();
});

it("serves a stored photo only through a well-formed key", async () => {
  const key = await storeProfilePhoto(store, "climber1", await makePngFile(300, 300));

  expect(await readProfilePhoto(env.PROFILE_PHOTOS, key)).not.toBeNull();
  expect(await readProfilePhoto(env.PROFILE_PHOTOS, "climber1/../../secret.webp")).toBeNull();
  expect(profilePhotoKeyFromImage(profilePhotoPath(key))).toBe(key);
});

it("logs rather than fails when the previous photo is a Google URL", async () => {
  const logged = vi.spyOn(console, "warn").mockImplementation(() => {});
  const mine = await storeProfilePhoto(store, "climber1", await makePngFile(300, 300));

  await expect(
    deletePreviousProfilePhoto(
      env.PROFILE_PHOTOS,
      "https://lh3.googleusercontent.com/a/x=s96-c",
      "climber1",
    ),
  ).resolves.toBeUndefined();

  expect(logged).toHaveBeenCalled();
  // Nothing of ours was named, so nothing of ours was touched.
  expect(await env.PROFILE_PHOTOS.get(mine)).not.toBeNull();
  logged.mockRestore();
});

it("passes quietly when the previous object is already gone", async () => {
  const failed = vi.spyOn(console, "error").mockImplementation(() => {});
  const key = await storeProfilePhoto(store, "climber1", await makePngFile(300, 300));
  await env.PROFILE_PHOTOS.delete(key);

  // R2's delete is idempotent, so a photo a racing removal already took is a
  // no-op rather than an error — and worth no extra request to detect.
  await expect(
    deletePreviousProfilePhoto(env.PROFILE_PHOTOS, profilePhotoPath(key), "climber1"),
  ).resolves.toBeUndefined();

  expect(failed).not.toHaveBeenCalled();
  failed.mockRestore();
});

it("says nothing when there was no previous photo at all", async () => {
  const logged = vi.spyOn(console, "warn").mockImplementation(() => {});

  await deletePreviousProfilePhoto(env.PROFILE_PHOTOS, null, "climber1");
  await deletePreviousProfilePhoto(env.PROFILE_PHOTOS, "", "climber1");

  // A brand new account has no photo; that is not worth a log line on every
  // first upload.
  expect(logged).not.toHaveBeenCalled();
  logged.mockRestore();
});

it("refuses a previous photo belonging to another climber", async () => {
  const logged = vi.spyOn(console, "warn").mockImplementation(() => {});
  const theirs = await storeProfilePhoto(store, "climber2", await makePngFile(300, 300));

  await deletePreviousProfilePhoto(env.PROFILE_PHOTOS, profilePhotoPath(theirs), "climber1");

  // The column can hold a path this app never wrote; acting on it would
  // delete another climber's photo.
  expect(await env.PROFILE_PHOTOS.get(theirs)).not.toBeNull();
  expect(logged).toHaveBeenCalled();
  logged.mockRestore();
});

it("deletes the previous photo when it is one of ours", async () => {
  const key = await storeProfilePhoto(store, "climber1", await makePngFile(300, 300));

  await deletePreviousProfilePhoto(env.PROFILE_PHOTOS, profilePhotoPath(key), "climber1");

  expect(await env.PROFILE_PHOTOS.get(key)).toBeNull();
});

it("deletes one photo and every photo a climber has had", async () => {
  const replaced = await storeProfilePhoto(store, "climber1", await makePngFile(300, 300));
  const current = await storeProfilePhoto(store, "climber1", await makePngFile(120, 300));
  const other = await storeProfilePhoto(store, "climber2", await makePngFile(300, 300));

  await deleteProfilePhoto(env.PROFILE_PHOTOS, replaced);
  expect(await env.PROFILE_PHOTOS.get(replaced)).toBeNull();
  expect(await env.PROFILE_PHOTOS.get(current)).not.toBeNull();

  await deleteProfilePhotosForUser(env.PROFILE_PHOTOS, "climber1");
  expect(await env.PROFILE_PHOTOS.get(current)).toBeNull();
  expect(await env.PROFILE_PHOTOS.get(other)).not.toBeNull();
});
