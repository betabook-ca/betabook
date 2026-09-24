import { PROFILE_PHOTO_CACHE_CONTROL, PROFILE_PHOTO_CONTENT_TYPE } from "@/lib/profile-photo";
import { getProfilePhotoBucket, readProfilePhoto } from "@/lib/profile-photo-store";

type RouteParams = { params: Promise<{ key: string[] }> };

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
 * `readProfilePhoto` re-checks the key's shape before the bucket read — the
 * key arrives as URL segments. `X-Robots-Tag: noindex` comes from the /api
 * rule in next.config.ts. */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const [bucket, { key }] = await Promise.all([getProfilePhotoBucket(), params]);
  const object = bucket ? await readProfilePhoto(bucket, key.join("/")) : null;

  if (!object) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": PROFILE_PHOTO_CONTENT_TYPE,
      "Cache-Control": PROFILE_PHOTO_CACHE_CONTROL,
      "Content-Length": String(object.size),
      ETag: object.httpEtag,
    },
  });
}
