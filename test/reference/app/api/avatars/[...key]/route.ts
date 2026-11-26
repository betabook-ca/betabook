import { after } from "next/server";

import {
  isProfilePhotoKey,
  PROFILE_PHOTO_CACHE_CONTROL,
  PROFILE_PHOTO_CACHE_NAME,
  PROFILE_PHOTO_CONTENT_TYPE,
  profilePhotoEtag,
  profilePhotoUnchanged,
} from "@/lib/profile-photo";
import { getProfilePhotoBucket } from "@/lib/profile-photo-store";

type RouteParams = { params: Promise<{ key: string[] }> };

const notFound = () =>
  new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });

const notModified = (etag: string) =>
  new Response(null, {
    status: 304,
    headers: { "Cache-Control": PROFILE_PHOTO_CACHE_CONTROL, ETag: etag },
  });

/** Serves one stored profile photo. Deliberately the app's only data route
 * without a session:
 *
 * - it has to render for every reader of a feed, a friends list and a
 *   signed-out share-link preview, which no single viewer check covers;
 * - a Google profile photo is likewise a public unauthenticated URL on
 *   Google's CDN, so this exposes nothing private profiles didn't already;
 * - the key is a digest of the bytes, so a URL is unguessable and names
 *   nothing about the climber beyond their opaque id.
 *
 * The key's shape is checked before anything else — it arrives as URL
 * segments, and this is the one guard between a crafted path and the bucket.
 * A Worker's response is not edge-cached on its own, so each colo keeps its
 * copy in a Cache API store for the response's own max-age and only a miss
 * reads R2; the write happens after the response, so a colo that cannot
 * store the copy still serves it. A conditional request gets no body, but
 * only once the colo or the bucket confirms the object still exists: a
 * removed photo's stale copies must not be renewed past that max-age.
 * `X-Robots-Tag: noindex` comes from the /api rule in next.config.ts. */
export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const key = (await params).key.join("/");
  if (!isProfilePhotoKey(key)) return notFound();

  const etag = profilePhotoEtag(key);
  const unchanged = profilePhotoUnchanged(request.headers.get("If-None-Match"), key);

  // The query string selects nothing here, so it must not split the cache.
  const url = new URL(request.url);
  url.search = "";
  const cache = await caches.open(PROFILE_PHOTO_CACHE_NAME);
  const cached = await cache.match(url.href);
  if (cached) return unchanged ? notModified(etag) : cached;

  const bucket = await getProfilePhotoBucket();
  const object = bucket ? await bucket.get(key) : null;
  if (!object) return notFound();

  const response = new Response(object.body, {
    headers: {
      "Content-Type": PROFILE_PHOTO_CONTENT_TYPE,
      "Cache-Control": PROFILE_PHOTO_CACHE_CONTROL,
      "Content-Length": String(object.size),
      ETag: etag,
    },
  });
  // Tee now: by the time the deferred write runs, the client owns the body.
  const copy = unchanged ? response : response.clone();
  after(() => cache.put(url.href, copy));
  return unchanged ? notModified(etag) : response;
}
