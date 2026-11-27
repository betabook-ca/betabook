import { describe, expect, it } from "vitest";

import { albumPhotoSrc, albumVideoSrc } from "./trip-album";

const PHOTO = "https://lh3.googleusercontent.com/pw/AP1GczNUNuva0hpWf0Fu63ZGGHNv-XoCW_XsASv";

describe("albumVideoSrc", () => {
  it("requests the 720p stream", () => {
    expect(albumVideoSrc({ url: PHOTO, width: 2160, height: 3840, video: { duration: 14 } })).toBe(
      `${PHOTO}=m22`,
    );
  });
});

describe("albumPhotoSrc", () => {
  it("requests the given width, capped at the photo's width", () => {
    expect(albumPhotoSrc({ url: PHOTO, width: 4000, height: 3000 }, 960)).toBe(`${PHOTO}=w960`);
    // Never request a width larger than the photo.
    expect(albumPhotoSrc({ url: PHOTO, width: 640, height: 480 }, 960)).toBe(`${PHOTO}=w640`);
  });
});
