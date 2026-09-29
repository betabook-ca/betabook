import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { loadAlbumPhotos } from "./trip-album-loader";

const PHOTO = "https://lh3.googleusercontent.com/pw/AP1GczNUNuva0hpWf0Fu63ZGGHNv-XoCW_XsASv";
const LONG = "https://photos.google.com/share/AF1QipMUVJgB2WzAdzUroYx?key=c0ZfN3Zk";
const PAGE = `<script>AF_initDataCallback({data:[null,[["AF1Qip",["${PHOTO}",1920,1080,null],1525436582000]]]});</script>`;

const request = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
let album = 0;
/** Use a URL no other test uses, to avoid a cache hit. */
function shortLink() {
  album += 1;
  return `https://photos.app.goo.gl/Album${String(album).padStart(8, "0")}${Date.now()}`.slice(
    0,
    60,
  );
}

const redirect = (to: string) => new Response(null, { status: 302, headers: { Location: to } });
const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

beforeEach(() => {
  request.mockReset();
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    request(input instanceof Request ? input.url : String(input), init),
  );
});
afterEach(() => vi.unstubAllGlobals());

it("follows a short link and reads the album's photos", async () => {
  const link = shortLink();
  request.mockResolvedValueOnce(redirect(LONG)).mockResolvedValueOnce(html(PAGE));

  expect(await loadAlbumPhotos(link)).toEqual([{ url: PHOTO, width: 1920, height: 1080 }]);
  expect(request.mock.calls.map(([url]) => url)).toEqual([link, LONG]);
  // Redirects are followed manually so each one can be validated.
  expect(request.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
});

it.each([
  ["a sign-in page", "https://accounts.google.com/ServiceLogin?continue=x"],
  ["a consent page", "https://consent.google.com/m?continue=x"],
  ["another site", "https://example.com/album"],
  ["an address inside a network", "http://169.254.169.254/latest/meta-data/"],
])("stops rather than follow a redirect to %s", async (_label, elsewhere) => {
  const link = shortLink();
  request.mockResolvedValueOnce(redirect(elsewhere));

  expect(await loadAlbumPhotos(link)).toEqual([]);
  expect(request).toHaveBeenCalledOnce();
});

it("stops after too many redirects", async () => {
  const link = shortLink();
  request.mockImplementation(async () => redirect(LONG));

  expect(await loadAlbumPhotos(link)).toEqual([]);
  expect(request.mock.calls.length).toBeLessThanOrEqual(4);
});

it.each([
  ["Google answers with an error", async () => html("gone", 404)],
  ["the page holds no album", async () => html("<html>Sign in</html>")],
  [
    "the response is not HTML",
    async () => new Response("{}", { headers: { "Content-Type": "application/json" } }),
  ],
  ["the request fails", async () => Promise.reject(new Error("network"))],
  ["the page is over the size limit", async () => html(`${PAGE}${"x".repeat(5 * 1024 * 1024)}`)],
])("shows no photos when %s", async (_label, answer) => {
  request.mockImplementation(answer);

  expect(await loadAlbumPhotos(shortLink())).toEqual([]);
});

it("caches a successful read", async () => {
  const link = shortLink();
  request.mockImplementation(async (url) => (url === link ? redirect(LONG) : html(PAGE)));

  const first = await loadAlbumPhotos(link);
  const second = await loadAlbumPhotos(link);

  expect(second).toEqual(first);
  expect(first).toHaveLength(1);
  expect(request).toHaveBeenCalledTimes(2);
});

it("caches a failed read", async () => {
  const link = shortLink();
  request.mockImplementation(async () => html("gone", 404));

  expect(await loadAlbumPhotos(link)).toEqual([]);
  expect(await loadAlbumPhotos(link)).toEqual([]);
  expect(request).toHaveBeenCalledOnce();
});

it("makes no request for a URL that isn't an album link", async () => {
  expect(await loadAlbumPhotos("https://example.com/albums/bishop")).toEqual([]);
  expect(request).not.toHaveBeenCalled();
});
