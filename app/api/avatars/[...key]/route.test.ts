import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { PROFILE_PHOTO_CACHE_CONTROL, PROFILE_PHOTO_PIXELS } from "@/lib/profile-photo";
import { storeProfilePhoto } from "@/lib/profile-photo-store";
import { makePngFile, toStream } from "@/test/image-fixtures";

import { GET } from "./route";

// The bucket is Miniflare's; only the request-context accessor is replaced.
vi.mock("@/lib/profile-photo-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/profile-photo-store")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getProfilePhotoBucket: async () => env.PROFILE_PHOTOS };
});

const request = (key: string) => new Request(`https://example.test/api/avatars/${key}`);
const params = (key: string) => ({ params: Promise.resolve({ key: key.split("/") }) });

async function store(userId = "climber1"): Promise<string> {
  return storeProfilePhoto(
    { bucket: env.PROFILE_PHOTOS, images: env.IMAGES },
    userId,
    await makePngFile(400, 400),
  );
}

beforeEach(async () => {
  const listed = await env.PROFILE_PHOTOS.list();
  if (listed.objects.length > 0)
    await env.PROFILE_PHOTOS.delete(listed.objects.map((object) => object.key));
});

it("serves the stored photo as a week-long immutable WebP", async () => {
  const key = await store();

  const response = await GET(request(key), params(key));

  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/webp");
  expect(response.headers.get("Cache-Control")).toBe(PROFILE_PHOTO_CACHE_CONTROL);
  expect(response.headers.get("Cache-Control")).toContain("max-age=604800");
  expect(response.headers.get("ETag")).toBeTruthy();

  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(response.headers.get("Content-Length")).toBe(String(bytes.length));
  expect(await env.IMAGES.info(toStream(bytes))).toMatchObject({
    format: "image/webp",
    width: PROFILE_PHOTO_PIXELS,
    height: PROFILE_PHOTO_PIXELS,
  });
});

it("is 404 for a key with no object, and caches nothing", async () => {
  const missing = "climber1/00000000000000000000000000000000.webp";

  const response = await GET(request(missing), params(missing));

  expect(response.status).toBe(404);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it("refuses a key that is not one climber's photo object", async () => {
  await store();

  const crafted = [
    "climber1/../../catalog/latest.json",
    "catalog/latest.json",
    "climber1/abab.webp",
    "climber1",
  ];
  const statuses = await Promise.all(
    crafted.map(async (key) => [key, (await GET(request(key), params(key))).status] as const),
  );

  expect(statuses).toEqual(crafted.map((key) => [key, 404]));
});

it("serves each climber only their own object", async () => {
  const mine = await store("climber1");
  const theirs = await store("climber2");
  expect(mine).not.toBe(theirs);

  // The key names its owner, so one climber's URL cannot address another's
  // object even though both photos are identical bytes.
  const swapped = `climber2/${mine.split("/")[1]}`;
  expect((await GET(request(swapped), params(swapped))).status).toBe(200);
  await env.PROFILE_PHOTOS.delete(theirs);
  expect((await GET(request(swapped), params(swapped))).status).toBe(404);
  expect((await GET(request(mine), params(mine))).status).toBe(200);
});
