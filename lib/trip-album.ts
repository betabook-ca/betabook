/** A trip's photos are a shared Google Photos album, read from the page
 * Google serves for its link. Google offers no embed and refuses to be framed
 * (`X-Frame-Options: SAMEORIGIN`), so the album's page is read for the
 * address of each photo, which is how Publicalbum embeds one. Nothing is
 * stored or proxied: the photos stay Google's, and a reader's browser fetches
 * them from Google. */

export type AlbumPhoto = { url: string; width: number; height: number };

/** A screenful or two. The album itself is one link away. */
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

/** The link as stored: one of the two shapes a shared album's link takes,
 * rebuilt from its parts so nothing else pasted with it is kept. */
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

/** Whether a request for an album may be sent here. A short link redirects,
 * and a redirect is followed only while it stays on Google Photos. */
export function isAlbumPage(value: string): boolean {
  const url = parse(value);
  return url !== null && (url.hostname === SHORT_HOST || url.hostname === LONG_HOST);
}

/** Each photo sits in the page's data as `["<address>",<width>,<height>,`.
 * The address is matched whole, so nothing but a photo in an album on
 * Google's image host is ever given to an `img`. */
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

/** Google resizes on request: `=w960` is the photo 960 pixels wide. */
export function albumPhotoSrc(photo: AlbumPhoto, width: number): string {
  return `${photo.url}=w${Math.min(width, photo.width)}`;
}
