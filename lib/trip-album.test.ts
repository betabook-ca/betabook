import { describe, expect, it } from "vitest";

import {
  MAX_ALBUM_PHOTOS,
  albumLink,
  albumPhotoSrc,
  isAlbumPage,
  albumVideoSrc,
  readAlbumPage,
} from "./trip-album";

const PHOTO = "https://lh3.googleusercontent.com/pw/AP1GczNUNuva0hpWf0Fu63ZGGHNv-XoCW_XsASv";

/** One photo entry, in the format the album page uses. */
function entry(url: string, width = 1920, height = 1080, fields = `{"15":1565}`) {
  return `["AF1QipNmpJAlhxumRlu6re4SEIlz4N49",["${url}",${width},${height},null,null,null,null,null,[null,null,1],[5723197]],1525436582000,"i7vW3_oTM6",7200000,1531341502659,["AF1QipM1gaieQspmoBNPNBHAzr77SqBZ"],[[2],[8],[21],[19],[22]],2,${fields}]`;
}

/** A video entry: the same as a photo, plus a field with its length in ms. */
function video(url: string, ms: number, width = 2160, height = 3840) {
  return entry(url, width, height, `{"15":168759,"76647426":[${ms},null,1080,1920,null,4]}`);
}

function page(entries: string[]) {
  return `<html><head><meta property="og:image" content="${PHOTO}=w600-h315-p-k"></head><body><script class="ds:1" nonce="x">AF_initDataCallback({key: 'ds:1', hash: '2', data:[null,[${entries.join(",")}]], sideChannel: {}});</script></body></html>`;
}

describe("albumLink", () => {
  it.each([
    ["the short share URL", "https://photos.app.goo.gl/Example1Album2Link3"],
    [
      "the long share URL",
      "https://photos.google.com/share/AF1QipMUVJgB2WzAdzUroYx_rTs9?key=c0ZfN3Zk-WE",
    ],
  ])("accepts %s", (_label, link) => {
    expect(albumLink(link)).toBe(link);
  });

  it("drops whitespace, extra query params and fragments", () => {
    expect(
      albumLink("  https://photos.app.goo.gl/Example1Album2Link3?utm_source=share#top \n"),
    ).toBe("https://photos.app.goo.gl/Example1Album2Link3");
    expect(albumLink("https://photos.google.com/share/AF1QipMUVJgB2WzAdz?pli=1&key=c0ZfN3Zk")).toBe(
      "https://photos.google.com/share/AF1QipMUVJgB2WzAdz?key=c0ZfN3Zk",
    );
  });

  it.each([
    ["an empty string", ""],
    ["plain text", "our photos"],
    ["another site", "https://example.com/albums/bishop"],
    ["an http URL", "http://photos.app.goo.gl/Example1Album2Link3"],
    ["a lookalike host", "https://photos.app.goo.gl.example.com/Example1Album2Link3"],
    ["a URL with credentials", "https://photos.app.goo.gl@example.com/Example1Album2Link3"],
    ["another port", "https://photos.app.goo.gl:8443/Example1Album2Link3"],
    ["the Google Photos home page", "https://photos.google.com/"],
    ["a single photo URL", "https://photos.google.com/photo/AF1QipMUVJgB2WzAdz"],
    ["a long share URL without a key", "https://photos.google.com/share/AF1QipMUVJgB2WzAdz"],
    ["a path with extra segments", "https://photos.app.goo.gl/Example1Album2Link3/../../x"],
    ["a javascript: URL", "javascript:alert(1)"],
  ])("rejects %s", (_label, link) => {
    expect(albumLink(link)).toBeNull();
  });
});

describe("isAlbumPage", () => {
  it("allows only Google Photos URLs", () => {
    expect(isAlbumPage("https://photos.app.goo.gl/Example1Album2Link3")).toBe(true);
    expect(isAlbumPage("https://photos.google.com/share/AF1Qip?key=abc")).toBe(true);
  });

  it.each([
    "https://accounts.google.com/ServiceLogin",
    "https://consent.google.com/m?continue=x",
    "https://example.com/",
    "http://photos.google.com/share/AF1Qip?key=abc",
    "http://169.254.169.254/latest/meta-data/",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isAlbumPage(url)).toBe(false);
  });
});

describe("readAlbumPage", () => {
  it("reads photos in order, without duplicates, with their sizes", () => {
    const other = `${PHOTO}2`;
    const album = readAlbumPage(page([entry(PHOTO), entry(other, 1080, 1920), entry(PHOTO)]));

    expect(album).toEqual([
      { url: PHOTO, width: 1920, height: 1080 },
      { url: other, width: 1080, height: 1920 },
    ]);
  });

  it("ignores URLs that aren't album photos", () => {
    const album = readAlbumPage(
      page([
        entry("https://lh3.googleusercontent.com/a/ACg8ocJprofilephoto"),
        entry("https://example.com/pw/AP1Gczelsewhere"),
        entry("https://lh3.googleusercontent.com.example.com/pw/AP1Gczlookalike"),
        entry(`${PHOTO}"onerror="alert(1)`),
        entry(PHOTO, 0, 1080),
        entry(`${PHOTO}3`, 4000, 3000),
      ]),
    );

    expect(album).toEqual([{ url: `${PHOTO}3`, width: 4000, height: 3000 }]);
  });

  it("marks videos with their length in seconds; the URL is the poster frame", () => {
    const clip = `${PHOTO}2`;
    const album = readAlbumPage(page([entry(PHOTO), video(clip, 14101)]));

    expect(album).toEqual([
      { url: PHOTO, width: 1920, height: 1080 },
      { url: clip, width: 2160, height: 3840, video: { duration: 14 } },
    ]);
  });

  it("reads the video field from whichever entry carries it", () => {
    // The album cover repeats an item's URL without the item's fields, and can
    // come first.
    const cover = `["${PHOTO}",2160,3840,null,null,null,null,null,[null,null,1]]`;
    const album = readAlbumPage(page([cover, video(PHOTO, 8768)]));

    expect(album).toEqual([{ url: PHOTO, width: 2160, height: 3840, video: { duration: 9 } }]);
  });

  it("stops at the photo limit", () => {
    const many = Array.from({ length: MAX_ALBUM_PHOTOS + 25 }, (_unused, index) =>
      entry(`${PHOTO}${index}`),
    );

    expect(readAlbumPage(page(many))).toHaveLength(MAX_ALBUM_PHOTOS);
  });

  it("returns nothing for a page without an album", () => {
    expect(readAlbumPage("<html><body>Sign in to continue</body></html>")).toEqual([]);
    expect(readAlbumPage("")).toEqual([]);
  });
});

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
