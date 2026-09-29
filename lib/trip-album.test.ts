import { describe, expect, it } from "vitest";

import {
  MAX_ALBUM_PHOTOS,
  albumLink,
  albumPhotoSrc,
  isAlbumPage,
  readAlbumPage,
} from "./trip-album";

const PHOTO = "https://lh3.googleusercontent.com/pw/AP1GczNUNuva0hpWf0Fu63ZGGHNv-XoCW_XsASv";

/** One photo as the shared album's page carries it. */
function entry(url: string, width = 1920, height = 1080) {
  return `["AF1QipNmpJAlhxumRlu6re4SEIlz4N49",["${url}",${width},${height},null,null,null,null,null,[null,null,1],[5723197]],1525436582000,"i7vW3_oTM6",7200000]`;
}

function page(entries: string[]) {
  return `<html><head><meta property="og:image" content="${PHOTO}=w600-h315-p-k"></head><body><script class="ds:1" nonce="x">AF_initDataCallback({key: 'ds:1', hash: '2', data:[null,[${entries.join(",")}]], sideChannel: {}});</script></body></html>`;
}

describe("a link to a shared album", () => {
  it.each([
    ["the short link Google Photos copies", "https://photos.app.goo.gl/Example1Album2Link3"],
    [
      "the long link a short one leads to",
      "https://photos.google.com/share/AF1QipMUVJgB2WzAdzUroYx_rTs9?key=c0ZfN3Zk-WE",
    ],
  ])("accepts %s", (_label, link) => {
    expect(albumLink(link)).toBe(link);
  });

  it("drops what was pasted around it", () => {
    expect(
      albumLink("  https://photos.app.goo.gl/Example1Album2Link3?utm_source=share#top \n"),
    ).toBe("https://photos.app.goo.gl/Example1Album2Link3");
    expect(albumLink("https://photos.google.com/share/AF1QipMUVJgB2WzAdz?pli=1&key=c0ZfN3Zk")).toBe(
      "https://photos.google.com/share/AF1QipMUVJgB2WzAdz?key=c0ZfN3Zk",
    );
  });

  it.each([
    ["nothing", ""],
    ["words", "our photos"],
    ["another site", "https://example.com/albums/bishop"],
    ["an unencrypted link", "http://photos.app.goo.gl/Example1Album2Link3"],
    ["a lookalike host", "https://photos.app.goo.gl.example.com/Example1Album2Link3"],
    ["a host hidden behind a name", "https://photos.app.goo.gl@example.com/Example1Album2Link3"],
    ["another port", "https://photos.app.goo.gl:8443/Example1Album2Link3"],
    ["Google Photos itself, with no album", "https://photos.google.com/"],
    ["a single photo in someone's library", "https://photos.google.com/photo/AF1QipMUVJgB2WzAdz"],
    ["a long link without its key", "https://photos.google.com/share/AF1QipMUVJgB2WzAdz"],
    ["a path beyond the album", "https://photos.app.goo.gl/Example1Album2Link3/../../x"],
    ["a script address", "javascript:alert(1)"],
  ])("refuses %s", (_label, link) => {
    expect(albumLink(link)).toBeNull();
  });
});

describe("where a request for an album may go", () => {
  it("stays on Google Photos", () => {
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
  ])("and nowhere else: %s", (url) => {
    expect(isAlbumPage(url)).toBe(false);
  });
});

describe("the photos on an album's page", () => {
  it("are read in the album's order, each once, with their size", () => {
    const other = `${PHOTO}2`;
    const album = readAlbumPage(page([entry(PHOTO), entry(other, 1080, 1920), entry(PHOTO)]));

    expect(album).toEqual([
      { url: PHOTO, width: 1920, height: 1080 },
      { url: other, width: 1080, height: 1920 },
    ]);
  });

  it("leaves out anything that is not a photo in an album", () => {
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

  it("stops at what a page can reasonably show", () => {
    const many = Array.from({ length: MAX_ALBUM_PHOTOS + 25 }, (_unused, index) =>
      entry(`${PHOTO}${index}`),
    );

    expect(readAlbumPage(page(many))).toHaveLength(MAX_ALBUM_PHOTOS);
  });

  it("is nothing when the page holds no album", () => {
    expect(readAlbumPage("<html><body>Sign in to continue</body></html>")).toEqual([]);
    expect(readAlbumPage("")).toEqual([]);
  });
});

describe("a photo's address at a given width", () => {
  it("asks Google for that width and no more", () => {
    expect(albumPhotoSrc({ url: PHOTO, width: 4000, height: 3000 }, 960)).toBe(`${PHOTO}=w960`);
    // Never upscaled: a small photo is asked for at its own width.
    expect(albumPhotoSrc({ url: PHOTO, width: 640, height: 480 }, 960)).toBe(`${PHOTO}=w640`);
  });
});
