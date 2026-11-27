import type { components } from "@/spa/generated/api";

export type AlbumPhoto = components["schemas"]["AlbumPhoto"];
export const MAX_ALBUM_LINK = 300;

/** Google resizes by URL suffix: `=w960` returns the photo 960px wide. For a
 * video this is the poster frame. */
export function albumPhotoSrc(photo: AlbumPhoto, width: number): string {
  return `${photo.url}=w${Math.min(width, photo.width)}`;
}

/** `=m22` redirects to a 720p MP4 stream that needs no Google session. */
export function albumVideoSrc(photo: AlbumPhoto): string {
  return `${photo.url}=m22`;
}
