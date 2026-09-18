import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { uploadProfilePhoto } from "@/actions";
import { createDb } from "@/db/client";
import { user } from "@/db/schema";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/action-result";
import {
  MAX_PROFILE_PHOTO_BYTES,
  PROFILE_PHOTO_MISSING_MESSAGE,
  PROFILE_PHOTO_TOO_LARGE_MESSAGE,
  PROFILE_PHOTO_TOO_MANY_MESSAGE,
  PROFILE_PHOTO_WRONG_TYPE_MESSAGE,
  profilePhotoKeyFromImage,
} from "@/lib/profile-photo";
import { seedFixtureUser } from "@/test/fixtures";
import { makePngFile } from "@/test/image-fixtures";

const sessionState = vi.hoisted(() => ({ userId: "test-user" as string | null }));
const limitState = vi.hoisted(() => ({ allowed: true }));

vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));

vi.mock("@/lib/session", async () => {
  const { NotSignedInError } = await import("@/lib/action-result");
  return {
    getSession: async () => (sessionState.userId ? { user: { id: sessionState.userId } } : null),
    requireSession: async () => {
      if (!sessionState.userId) throw new NotSignedInError();
      return { user: { id: sessionState.userId } };
    },
  };
});

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

// Only the request-context accessors are replaced; the bucket and the
// transform are Miniflare's own, so this exercises the real store.
vi.mock("@/lib/profile-photo-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/profile-photo-store")>();
  const { env } = await import("cloudflare:test");
  return {
    ...actual,
    getProfilePhotoBucket: async () => env.PROFILE_PHOTOS,
    getProfilePhotoStore: async () => ({ bucket: env.PROFILE_PHOTOS, images: env.IMAGES }),
  };
});

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, allowProfilePhotoWrite: async () => limitState.allowed };
});

const db = createDb(env.DB);
const GOOGLE_PHOTO = "https://lh3.googleusercontent.com/a/avatar=s96-c";

async function form(file: File | string): Promise<FormData> {
  const data = new FormData();
  data.set("photo", file);
  return data;
}

async function storedImage(userId = "test-user"): Promise<string | null | undefined> {
  return (await db.select({ image: user.image }).from(user).where(eq(user.id, userId)).get())
    ?.image;
}

async function keys(): Promise<string[]> {
  return (await env.PROFILE_PHOTOS.list()).objects.map((object) => object.key);
}

beforeEach(async () => {
  sessionState.userId = "test-user";
  limitState.allowed = true;
  await db.delete(user);
  await seedFixtureUser(db, { id: "test-user" });
  await seedFixtureUser(db, { id: "other-user" });
  const listed = await env.PROFILE_PHOTOS.list();
  if (listed.objects.length > 0)
    await env.PROFILE_PHOTOS.delete(listed.objects.map((object) => object.key));
});

it("stores the photo and points the climber's row at it", async () => {
  const result = await uploadProfilePhoto(await form(await makePngFile(512, 512)));

  expect(result).toEqual({ ok: true, value: undefined });
  const image = await storedImage();
  const key = profilePhotoKeyFromImage(image);
  expect(key).not.toBeNull();
  expect(key?.startsWith("test-user/")).toBe(true);
  expect(await keys()).toEqual([key]);
  expect(await storedImage("other-user")).toBeNull();
});

it("deletes the photo it replaces, keeping one object per climber", async () => {
  await uploadProfilePhoto(await form(await makePngFile(512, 512)));
  const first = profilePhotoKeyFromImage(await storedImage());

  await uploadProfilePhoto(await form(await makePngFile(300, 500)));
  const second = profilePhotoKeyFromImage(await storedImage());

  expect(second).not.toBe(first);
  expect(await keys()).toEqual([second]);
});

it("keeps the object when the same crop is uploaded again", async () => {
  await uploadProfilePhoto(await form(await makePngFile(512, 512)));
  const first = profilePhotoKeyFromImage(await storedImage());

  // Same bytes hash to the same key: the replacement must not delete what it
  // just wrote.
  await uploadProfilePhoto(await form(await makePngFile(512, 512)));

  expect(profilePhotoKeyFromImage(await storedImage())).toBe(first);
  expect(await keys()).toEqual([first]);
});

it("replaces a Google photo without leaving anything to clean up", async () => {
  await db.update(user).set({ image: GOOGLE_PHOTO }).where(eq(user.id, "test-user"));

  await uploadProfilePhoto(await form(await makePngFile(400, 400)));

  const key = profilePhotoKeyFromImage(await storedImage());
  expect(key).not.toBeNull();
  expect(await keys()).toEqual([key]);
});

it("requires a signed-in climber and stores nothing", async () => {
  sessionState.userId = null;

  const result = await uploadProfilePhoto(await form(await makePngFile(512, 512)));

  expect(result).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
  expect(await keys()).toEqual([]);
  expect(await storedImage()).toBeNull();
});

it("refuses a file too large for the action to accept", async () => {
  const huge = new File([new Uint8Array(MAX_PROFILE_PHOTO_BYTES + 1)], "photo.png", {
    type: "image/png",
  });

  expect(await uploadProfilePhoto(await form(huge))).toEqual({
    ok: false,
    error: PROFILE_PHOTO_TOO_LARGE_MESSAGE,
  });
  expect(await keys()).toEqual([]);
  expect(await storedImage()).toBeNull();
});

it("refuses a file that is not one of the accepted image types", async () => {
  const pdf = new File([new Uint8Array(1024)], "photo.pdf", { type: "application/pdf" });

  expect(await uploadProfilePhoto(await form(pdf))).toEqual({
    ok: false,
    error: PROFILE_PHOTO_WRONG_TYPE_MESSAGE,
  });
  expect(await keys()).toEqual([]);
});

it("refuses a submission carrying no file", async () => {
  expect(await uploadProfilePhoto(await form("not-a-file"))).toEqual({
    ok: false,
    error: PROFILE_PHOTO_MISSING_MESSAGE,
  });
  expect(await keys()).toEqual([]);
});

it("throttles uploads before spending a transformation", async () => {
  limitState.allowed = false;

  expect(await uploadProfilePhoto(await form(await makePngFile(512, 512)))).toEqual({
    ok: false,
    error: PROFILE_PHOTO_TOO_MANY_MESSAGE,
  });
  expect(await keys()).toEqual([]);
  expect(await storedImage()).toBeNull();
});

it("leaves an existing photo in place when a throttled upload is refused", async () => {
  await uploadProfilePhoto(await form(await makePngFile(512, 512)));
  const existing = await storedImage();
  limitState.allowed = false;

  await uploadProfilePhoto(await form(await makePngFile(300, 500)));

  expect(await storedImage()).toBe(existing);
  expect(await keys()).toEqual([profilePhotoKeyFromImage(existing)]);
});
