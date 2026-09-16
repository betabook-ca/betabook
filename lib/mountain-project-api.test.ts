import { afterEach, expect, it, vi } from "vitest";

import { fetchMountainProjectTicks } from "./mountain-project-api";
import { MAX_IMPORT_FILE_BYTES } from "./sends-import";

const HEADER =
  'Date,Route,Rating,Notes,URL,Pitches,Location,"Avg Stars","Your Stars",Style,"Lead Style","Route Type","Your Rating",Length,"Rating Code"';
const TICKS = `${HEADER}\n2026-09-12,"Double Play",V6,,https://www.mountainproject.com/route/1/x,1,"Exit 38",3.3,3,Send,,Boulder,V6,12,20600`;

const redirect = (location: string, status = 301) =>
  new Response(null, { status, headers: { Location: location } });
const profileRedirect = () =>
  redirect("https://www.mountainproject.com/user/200226064/eric-bonilla");
const ticks = (body = TICKS, headers: Record<string, string> = {}) =>
  new Response(body, { headers: { "Content-Type": "text/csv; charset=UTF-8", ...headers } });
const signal = () => new AbortController().signal;
const urls = (fetcher: ReturnType<typeof vi.fn<typeof fetch>>) =>
  fetcher.mock.calls.map(([url]) => url);
afterEach(() => vi.unstubAllGlobals());

it("resolves the profile name, then downloads the tick export from a fixed origin", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(profileRedirect())
    .mockResolvedValueOnce(ticks());
  vi.stubGlobal("fetch", fetcher);
  const result = await fetchMountainProjectTicks(
    "https://www.mountainproject.com/user/200226064/eric-bonilla/ticks",
    signal(),
  );
  expect(result).toEqual({ userId: "200226064", username: "eric-bonilla", csv: TICKS });
  expect(urls(fetcher)).toEqual([
    "https://www.mountainproject.com/user/200226064",
    "https://www.mountainproject.com/user/200226064/eric-bonilla/tick-export",
  ]);
  for (const [, init] of fetcher.mock.calls) {
    expect(init).toMatchObject({ credentials: "omit", redirect: "manual" });
    expect(new Headers(init?.headers).has("cookie")).toBe(false);
  }
});

it("downloads under a placeholder name when the profile redirect is unfamiliar", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(redirect("https://example.com/somewhere-else"))
    .mockResolvedValueOnce(ticks());
  vi.stubGlobal("fetch", fetcher);
  const result = await fetchMountainProjectTicks("200226064", signal());
  expect(result.username).toBe("");
  expect(urls(fetcher)[1]).toBe("https://www.mountainproject.com/user/200226064/ticks/tick-export");
});

it("reports a missing profile without requesting the export", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(fetchMountainProjectTicks("200226064", signal())).rejects.toThrow(
    /could not be found/i,
  );
  expect(fetcher).toHaveBeenCalledOnce();
});

it("asks the user to wait when Mountain Project rate limits the download", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(profileRedirect())
      .mockResolvedValueOnce(new Response("", { status: 429 })),
  );
  await expect(fetchMountainProjectTicks("200226064", signal())).rejects.toThrow(
    /too many requests/i,
  );
});

it("points at the CSV upload when the export is not CSV", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(profileRedirect())
      .mockResolvedValueOnce(
        new Response("<html>profile</html>", { headers: { "Content-Type": "text/html" } }),
      ),
  );
  await expect(fetchMountainProjectTicks("200226064", signal())).rejects.toThrow(
    /Download your ticks as a CSV/i,
  );
});

it("rejects an export that redirects instead of returning a file", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(profileRedirect())
      .mockResolvedValueOnce(redirect("https://www.mountainproject.com/user/200226064", 302)),
  );
  await expect(fetchMountainProjectTicks("200226064", signal())).rejects.toThrow(
    /unexpected response/i,
  );
});

it("rejects an export larger than the import limit before reading it", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(profileRedirect())
    .mockResolvedValueOnce(ticks(TICKS, { "Content-Length": String(MAX_IMPORT_FILE_BYTES + 1) }));
  vi.stubGlobal("fetch", fetcher);
  await expect(fetchMountainProjectTicks("200226064", signal())).rejects.toThrow(/too large/i);
});

it("stops reading an export that streams past the import limit", async () => {
  const chunk = new Uint8Array(1024 * 1024).fill(65);
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(stream) {
      sent += 1;
      if (sent > MAX_IMPORT_FILE_BYTES / chunk.byteLength + 2) {
        stream.close();
        return;
      }
      stream.enqueue(chunk);
    },
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(profileRedirect())
      .mockResolvedValueOnce(new Response(body, { headers: { "Content-Type": "text/csv" } })),
  );
  await expect(fetchMountainProjectTicks("200226064", signal())).rejects.toThrow(/too large/i);
  expect(sent).toBeLessThanOrEqual(MAX_IMPORT_FILE_BYTES / chunk.byteLength + 1);
});

it("rejects an empty export and input that is not a user ID", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValueOnce(profileRedirect()).mockResolvedValueOnce(ticks("")),
  );
  await expect(fetchMountainProjectTicks("200226064", signal())).rejects.toThrow(
    /unexpected response/i,
  );
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  await expect(fetchMountainProjectTicks("not-an-id", signal())).rejects.toThrow(
    /Mountain Project/,
  );
  expect(fetcher).not.toHaveBeenCalled();
});
