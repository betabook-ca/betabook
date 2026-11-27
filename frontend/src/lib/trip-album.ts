/** Trip photos come from a shared Google Photos album. Google has no embed and
 * blocks iframes (`X-Frame-Options: SAMEORIGIN`), so we read the album page for
 * photo URLs, the same way Publicalbum does. We don't store or proxy photos;
 * the browser loads them from Google. */

export type AlbumPhoto = {
  url: string;
  width: number;
  height: number;
  /** Set for a video. `url` is then its poster frame. */
  video?: { duration: number };
};

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
/** A video's item carries its length in ms in this field, a few hundred
 * characters after the poster URL. Photos have no such field. */
const VIDEO = /"76647426":\[(\d{1,9}),/;
/** How far after its URL an item's fields can be. */
const ITEM_SPAN = 2000;

export function readAlbumPage(html: string): AlbumPhoto[] {
  const photos = new Map<string, AlbumPhoto>();
  const matches = [...html.matchAll(PHOTO)];
  for (const [index, match] of matches.entries()) {
    const [, url, width, height] = match;
    const size = { width: Number(width), height: Number(height) };
    if (size.width <= 0 || size.height <= 0) continue;
    // An item's fields end where the next item starts.
    const start = match.index + match[0].length;
    const end = Math.min(matches[index + 1]?.index ?? html.length, start + ITEM_SPAN);
    const length = VIDEO.exec(html.slice(start, end));
    const video = length ? { duration: Math.round(Number(length[1]) / 1000) } : undefined;
    const known = photos.get(url);
    // The album cover repeats a URL without the item's fields.
    if (known) {
      if (video && !known.video) known.video = video;
      continue;
    }
    if (photos.size >= MAX_ALBUM_PHOTOS) break;
    photos.set(url, video ? { url, ...size, video } : { url, ...size });
  }
  return [...photos.values()];
}

/** Google resizes by URL suffix: `=w960` returns the photo 960px wide. For a
 * video this is the poster frame. */
export function albumPhotoSrc(photo: AlbumPhoto, width: number): string {
  return `${photo.url}=w${Math.min(width, photo.width)}`;
}

/** `=m22` redirects to a 720p MP4 stream that needs no Google session. */
export function albumVideoSrc(photo: AlbumPhoto): string {
  return `${photo.url}=m22`;
}
