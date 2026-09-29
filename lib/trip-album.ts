/** Trip photos come from a shared Google Photos album. Google has no embed and
 * blocks iframes (`X-Frame-Options: SAMEORIGIN`), so we read the album page for
 * photo URLs, the same way Publicalbum does. We don't store or proxy photos;
 * the browser loads them from Google. */

export type AlbumPhoto = { url: string; width: number; height: number };

/** Max photos to show. The full album is linked. */
export const MAX_ALBUM_PHOTOS = 40;
export const MAX_ALBUM_LINK = 300;

const SHORT_HOST = "photos.app.goo.gl";
const LONG_HOST = "photos.google.com";
const SHORT_PATH = /^\/[A-Za-z0-9]{6,40}$/;
const LONG_PATH = /^\/share\/[\w-]{10,200}$/;
const KEY = /^[\w-]{4,200}$/;

function parse(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    const plain = url.protocol === "https:" && !url.username && !url.password && !url.port;
    return plain ? url : null;
  } catch {
    return null;
  }
}

/** Normalizes an album URL. Accepts the two URL formats Google Photos uses for
 * shared albums and rebuilds the URL from its parts, dropping anything else. */
export function albumLink(value: string): string | null {
  const url = parse(value);
  if (!url) return null;
  if (url.hostname === SHORT_HOST && SHORT_PATH.test(url.pathname)) {
    return `https://${SHORT_HOST}${url.pathname}`;
  }
  const key = url.searchParams.get("key");
  if (url.hostname === LONG_HOST && LONG_PATH.test(url.pathname) && key && KEY.test(key)) {
    return `https://${LONG_HOST}${url.pathname}?key=${key}`;
  }
  return null;
}

/** Whether a URL is an allowed fetch target. Used to validate redirects, which
 * must stay on Google Photos. */
export function isAlbumPage(value: string): boolean {
  const url = parse(value);
  return url !== null && (url.hostname === SHORT_HOST || url.hostname === LONG_HOST);
}

/** Photos appear in the page data as `["<url>",<width>,<height>,`. The regex
 * matches the full URL, so only photo URLs on Google's image host are used as
 * `img` sources. */
const PHOTO =
  /\["(https:\/\/lh3\.googleusercontent\.com\/pw\/[\w-]{20,400})",(\d{1,5}),(\d{1,5}),/g;

export function readAlbumPage(html: string): AlbumPhoto[] {
  const photos = new Map<string, AlbumPhoto>();
  for (const [, url, width, height] of html.matchAll(PHOTO)) {
    if (photos.size >= MAX_ALBUM_PHOTOS) break;
    const size = { width: Number(width), height: Number(height) };
    if (size.width > 0 && size.height > 0 && !photos.has(url)) photos.set(url, { url, ...size });
  }
  return [...photos.values()];
}

/** Google resizes by URL suffix: `=w960` returns the photo 960px wide. */
export function albumPhotoSrc(photo: AlbumPhoto, width: number): string {
  return `${photo.url}=w${Math.min(width, photo.width)}`;
}
