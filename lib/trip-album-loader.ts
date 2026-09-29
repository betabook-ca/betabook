import { albumLink, isAlbumPage, readAlbumPage, type AlbumPhoto } from "@/lib/trip-album";

/** Name of the Cache API cache for album results. */
const CACHE_NAME = "trip-albums";
/** How long a successful read is cached. New photos can take this long to
 * appear. */
const FRESH_SECONDS = 60 * 60;
/** How long a failed read is cached, so every page view doesn't retry a failing
 * request. */
const UNREAD_SECONDS = 5 * 60;
/** Max redirects to follow. Short links redirect once. */
const MAX_HOPS = 3;
const TIMEOUT_MS = 4000;
/** Max response size to read. A shared album page is a little over 1 MB. */
const MAX_PAGE_BYTES = 4 * 1024 * 1024;

async function readPage(response: Response): Promise<string | null> {
  if (!response.ok || !response.body) return null;
  if (!response.headers.get("Content-Type")?.startsWith("text/html")) return null;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return html + decoder.decode();
    bytes += value.byteLength;
    if (bytes > MAX_PAGE_BYTES) {
      await reader.cancel();
      return null;
    }
    html += decoder.decode(value, { stream: true });
  }
}

/** Validate every redirect target before requesting it, so a user-supplied link
 * can't be used to fetch anything other than a Google Photos album. */
async function fetchPage(link: string): Promise<string | null> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = link;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    if (!isAlbumPage(url)) return null;
    const response = await fetch(url, {
      redirect: "manual",
      signal,
      headers: { Accept: "text/html", "Accept-Language": "en" },
    });
    const next = response.headers.get("Location");
    if (response.status < 300 || response.status >= 400 || !next) return readPage(response);
    await response.body?.cancel();
    url = new URL(next, url).href;
  }
  return null;
}

async function readAlbum(link: string): Promise<AlbumPhoto[]> {
  try {
    const html = await fetchPage(link);
    return html ? readAlbumPage(html) : [];
  } catch {
    return [];
  }
}

/** Returns the album's photos, or an empty list if the album can't be read
 * (unshared, page format changed, timeout). The trip page still renders without
 * photos. */
export async function loadAlbumPhotos(link: string): Promise<AlbumPhoto[]> {
  const album = albumLink(link);
  if (!album) return [];

  const key = `https://trip-albums.invalid/${encodeURIComponent(album)}`;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(key);
  if (cached) return cached.json<AlbumPhoto[]>();

  const photos = await readAlbum(album);
  const seconds = photos.length > 0 ? FRESH_SECONDS : UNREAD_SECONDS;
  await cache.put(
    key,
    Response.json(photos, { headers: { "Cache-Control": `public, max-age=${seconds}` } }),
  );
  return photos;
}
