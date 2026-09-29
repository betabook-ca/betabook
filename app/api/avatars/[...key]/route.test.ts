import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import {
  PROFILE_PHOTO_CACHE_CONTROL,
  PROFILE_PHOTO_CACHE_NAME,
  PROFILE_PHOTO_PIXELS,
  profilePhotoEtag,
} from "@/lib/profile-photo";
import { storeProfilePhoto } from "@/lib/profile-photo-store";
import { makePngFile, toStream } from "@/test/image-fixtures";

import { GET } from "./route";

// The bucket is Miniflare's; only the request-context accessor is replaced.
vi.mock("@/lib/profile-photo-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/profile-photo-store")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getProfilePhotoBucket: async () => env.PROFILE_PHOTOS };
});
// after() defers the cache write past the response; tests run it by hand.
const afterTasks = vi.hoisted(() => [] as Array<() => Promise<unknown>>);
vi.mock("next/server", () => ({
  after: (task: () => Promise<unknown>) => {
    afterTasks.push(task);
  },
}));
const settle = async () => {
  while (afterTasks.length > 0) await afterTasks.shift()?.();
};

const request = (key: string) => new Request(`https://example.test/api/avatars/${key}`);
const params = (key: string) => ({ params: Promise.resolve({ key: key.split("/") }) });
const edgeCache = () => caches.open(PROFILE_PHOTO_CACHE_NAME);

async function store(userId = "climber1"): Promise<string> {
  return storeProfilePhoto(
    { bucket: env.PROFILE_PHOTOS, images: env.IMAGES },
    userId,
    await makePngFile(400, 400),
  );
}

beforeEach(async () => {
  afterTasks.length = 0;
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
  expect(response.headers.get("ETag")).toBe(profilePhotoEtag(key));

  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(response.headers.get("Content-Length")).toBe(String(bytes.length));
  expect(await env.IMAGES.info(toStream(bytes))).toMatchObject({
    format: "image/webp",
    width: PROFILE_PHOTO_PIXELS,
    height: PROFILE_PHOTO_PIXELS,
  });
});

it("serves a colo's repeat request from the edge cache instead of the bucket", async () => {
  const key = await store();
  const first = await GET(request(key), params(key));
  const bytes = new Uint8Array(await first.arrayBuffer());
  await settle();

  // With the object gone, only the cache can answer.
  await env.PROFILE_PHOTOS.delete(key);
  const repeat = await GET(request(key), params(key));

  expect(repeat.status).toBe(200);
  expect(repeat.headers.get("Content-Type")).toBe("image/webp");
  expect(repeat.headers.get("ETag")).toBe(profilePhotoEtag(key));
  expect(new Uint8Array(await repeat.arrayBuffer())).toEqual(bytes);

  await (await edgeCache()).delete(request(key).url);
  expect((await GET(request(key), params(key))).status).toBe(404);
});

it("ignores the query string when caching, so one photo is one entry", async () => {
  const key = await store();
  const withQuery = (query: string) => GET(new Request(`${request(key).url}${query}`), params(key));

  expect((await withQuery("?v=1")).status).toBe(200);
  await settle();

  // Only the cache can answer now, and it was filled under the bare URL.
  await env.PROFILE_PHOTOS.delete(key);
  expect((await GET(request(key), params(key))).status).toBe(200);
  expect((await withQuery("?v=2")).status).toBe(200);
  expect(await (await edgeCache()).match(`${request(key).url}?v=1`)).toBeUndefined();
});

it("answers a conditional request without a body only while the photo exists", async () => {
  const key = await store();
  const etag = profilePhotoEtag(key);
  const conditional = (tag: string) =>
    GET(new Request(request(key).url, { headers: { "If-None-Match": tag } }), params(key));

  for (const tag of [etag, `W/${etag}`, `"other", ${etag}`]) {
    const response = await conditional(tag);
    expect(response.status).toBe(304);
    expect(response.headers.get("ETag")).toBe(etag);
    expect(response.headers.get("Cache-Control")).toBe(PROFILE_PHOTO_CACHE_CONTROL);
    expect(await response.text()).toBe("");
    await settle();
  }
  // The cold-colo check read the bucket once and kept the copy for everyone.
  expect(await (await edgeCache()).match(request(key).url)).toBeDefined();
  expect((await conditional('"0000"')).status).toBe(200);

  // A removed photo: the warm colo still vouches for it until its copy
  // expires, a cold one reports it gone instead of renewing a stale client.
  await env.PROFILE_PHOTOS.delete(key);
  expect((await conditional(etag)).status).toBe(304);
  await (await edgeCache()).delete(request(key).url);
  expect((await conditional(etag)).status).toBe(404);
});

it("is 404 for a key with no object, and caches nothing", async () => {
  const missing = "climber1/00000000000000000000000000000000.webp";

  const response = await GET(request(missing), params(missing));

  expect(response.status).toBe(404);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(afterTasks).toHaveLength(0);
  expect(await (await edgeCache()).match(request(missing).url)).toBeUndefined();
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
  await settle();
  await env.PROFILE_PHOTOS.delete(theirs);
  // A cold colo asks the bucket, which no longer has climber2's object.
  await (await edgeCache()).delete(request(swapped).url);
  expect((await GET(request(swapped), params(swapped))).status).toBe(404);
  expect((await GET(request(mine), params(mine))).status).toBe(200);
});
