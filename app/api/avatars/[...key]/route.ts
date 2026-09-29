import {
  isProfilePhotoKey,
  PROFILE_PHOTO_CACHE_CONTROL,
  PROFILE_PHOTO_CACHE_NAME,
  PROFILE_PHOTO_CONTENT_TYPE,
  profilePhotoEtag,
  profilePhotoUnchanged,
} from "@/lib/profile-photo";
import { getProfilePhotoBucket, readProfilePhoto } from "@/lib/profile-photo-store";

type RouteParams = { params: Promise<{ key: string[] }> };

const notFound = () =>
  new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
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
 * segments. A Worker's response is not edge-cached on its own, so each colo
 * keeps its copy in a Cache API store for the response's own max-age and only
 * a miss reads R2; a conditional request is answered from the key alone.
 * `X-Robots-Tag: noindex` comes from the /api rule in next.config.ts. */
export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const key = (await params).key.join("/");
  if (!isProfilePhotoKey(key)) return notFound();

  const etag = profilePhotoEtag(key);
  if (profilePhotoUnchanged(request.headers.get("If-None-Match"), key)) {
    return new Response(null, {
      status: 304,
      headers: { "Cache-Control": PROFILE_PHOTO_CACHE_CONTROL, ETag: etag },
    });
  }

  const cache = await caches.open(PROFILE_PHOTO_CACHE_NAME);
  const cached = await cache.match(request.url);
  if (cached) return cached;

  const bucket = await getProfilePhotoBucket();
  const object = bucket ? await readProfilePhoto(bucket, key) : null;
  if (!object) return notFound();

  const response = new Response(object.body, {
    headers: {
      "Content-Type": PROFILE_PHOTO_CONTENT_TYPE,
      "Cache-Control": PROFILE_PHOTO_CACHE_CONTROL,
      "Content-Length": String(object.size),
      ETag: etag,
    },
  });
  await cache.put(request.url, response.clone());
  return response;
}
