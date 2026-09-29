import { albumLink, isAlbumPage, readAlbumPage, type AlbumPhoto } from "@/lib/trip-album";

/** The Cache API store each colo keeps read albums in. */
const CACHE_NAME = "trip-albums";
/** How long a read album is shown before Google is asked again, which is how
 * long a photo added to the album can take to appear. */
const FRESH_SECONDS = 60 * 60;
/** An album that could not be read is not asked for again at once: every
 * reader of the trip would otherwise wait on the same failing request. */
const UNREAD_SECONDS = 5 * 60;
/** A short link redirects once. */
const MAX_HOPS = 3;
const TIMEOUT_MS = 4000;
/** A shared album's page is a little over 1 MB. */
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

/** Every hop is checked before it is made: the link is a climber's, and a
 * redirect must not turn a request for an album into a request for anything
 * else. */
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

/** The photos in a shared album, or none when it cannot be read: a link
 * that was unshared, a page Google has changed, a request that timed out.
 * The trip still shows; its photos do not. */
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
