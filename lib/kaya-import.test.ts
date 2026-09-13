import { afterEach, expect, it, vi } from "vitest";

import { AuthenticationRequiredError } from "@/lib/api-client";
import type { KayaImportProgress } from "@/lib/kaya-import-stream";
import { kayaStreamResponse as page } from "@/test/kaya";

import { fetchKayaImport } from "./kaya-import";
import { guessColumnMapping, guessClimbTypeMapping } from "./sends-import";

function ascent(id: string, type = "1", extra = {}) {
  return {
    id,
    date: "2026-08-20T09:10:09.000Z",
    comment: "Nice &amp; sunny",
    rating: 4,
    stiffness: -1,
    grade: { name: type === "1" ? "v3" : "5.10a" },
    climb: {
      id,
      name: `Climb ${id}`,
      climb_type: { id: type, name: type === "1" ? "Bouldering" : "Routes" },
      grade: { name: type === "1" ? "v4" : "5.10b" },
      gym: null,
      board: null,
      destination: { name: "Squamish" },
      area: { name: "Grand Wall" },
    },
    ...extra,
  };
}
const options = () => ({ signal: new AbortController().signal });
afterEach(() => vi.unstubAllGlobals());

it("loads both outdoor disciplines and preserves send values for the wizard", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      page(
        [
          ...Array.from({ length: 100 }, (_, i) => ascent(String(i))),
          ascent("100", "1", { date: null, rating: null, stiffness: null, grade: null }),
        ],
        101,
      ),
    )
    .mockResolvedValueOnce(page([ascent("route", "2")], 1));
  vi.stubGlobal("fetch", fetcher);
  const onProgress = vi.fn<(progress: KayaImportProgress) => void>();
  const result = await fetchKayaImport("https://kaya-app.kayaclimb.com/user/suzilu", {
    ...options(),
    onProgress,
  });
  expect(result.username).toBe("suzilu");
  expect(result.parsed.rows).toHaveLength(102);
  expect(result.parsed.rows[0]).toMatchObject({
    "Climb Name": "Climb 0",
    "Climb Type": "boulder",
    Grade: "V3",
    "Posted Grade": "V4",
    Rating: "4",
    Stiffness: "soft",
    Comments: "Nice &amp; sunny",
    Location: "Grand Wall",
    Region: "Squamish",
  });
  expect(result.parsed.rows[100]).toMatchObject({ Date: "", Grade: "", Rating: "", Stiffness: "" });
  expect(result.parsed.rows[101]).toMatchObject({ "Climb Type": "route", Grade: "5.10a" });
  expect(guessClimbTypeMapping(["route"])).toEqual({ route: "route" });
  expect(guessColumnMapping(result.parsed.headers)).toMatchObject({
    climbName: "Climb Name",
    ascentStyle: "Ascent Type",
    areaHints: ["Location", "Region"],
  });
  expect(result.parsed.warnings.join(" ")).toMatch(/redpoint.*flash.*onsight/i);
  expect(onProgress).toHaveBeenCalledWith({
    discipline: "boulder",
    loaded: 100,
    total: 101,
    retry: null,
  });
  expect(onProgress).toHaveBeenLastCalledWith({
    discipline: "route",
    loaded: 1,
    total: 1,
    retry: null,
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1][0]).toContain("climbTypeId=2");
});

it("excludes gym, board, unsupported disciplines, and climbs without an outdoor location", async () => {
  const original = ascent("outdoor");
  const excluded = [
    { ...original, id: "gym", climb: { ...original.climb, gym: { name: "Gym" } } },
    { ...original, id: "board", climb: { ...original.climb, board: { name: "Board" } } },
    { ...original, id: "unknown", climb: { ...original.climb, destination: null, area: null } },
    ascent("other", "3"),
  ];
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([original, ...excluded], 5))
      .mockResolvedValueOnce(page([], 0)),
  );
  const result = await fetchKayaImport("suzilu", options());
  expect(result.parsed.rows.map((row) => row["Climb Name"])).toEqual(["Climb outdoor"]);
  expect(result.parsed.warnings.join(" ")).toMatch(/4.*excluded/i);
});

it("rejects incomplete pages and never returns partially loaded history", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValueOnce(page([ascent("1")], 2)));
  await expect(fetchKayaImport("suzilu", options())).rejects.toThrow(/complete|changed/i);
});

it("discards boulders if loading routes fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([ascent("1")], 1))
      .mockResolvedValueOnce(
        Response.json({ error: "KAYA is unavailable. Try again." }, { status: 502 }),
      ),
  );
  await expect(fetchKayaImport("suzilu", options())).rejects.toThrow(/unavailable/i);
});

it("rejects duplicate pages, malformed values, and unexpected profile changes", async () => {
  for (const response of [
    page([ascent("1"), ascent("1")], 2),
    page([ascent("1", "1", { rating: 9 })], 1),
    page([], 0, "someone_else"),
  ]) {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));
    await expect(fetchKayaImport("suzilu", options())).rejects.toThrow(
      /KAYA|abort|complete|format/i,
    );
  }
});

it("rejects arbitrary URLs and cancellation before any request", async () => {
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  for (const input of [
    "https://evil.test/user/suzilu",
    "https://kaya-app.kayaclimb.com.evil.test/user/suzilu",
    "https://kaya-app.kayaclimb.com/user/a%2Fb",
    "../admin",
  ]) {
    await expect(fetchKayaImport(input, options())).rejects.toThrow(/KAYA|abort|complete|format/i);
  }
  const controller = new AbortController();
  controller.abort();
  await expect(fetchKayaImport("suzilu", { signal: controller.signal })).rejects.toThrow(
    /KAYA|abort|complete|format/i,
  );
  expect(fetcher).not.toHaveBeenCalled();
});

it("reports streamed page counts before completion and handles split Unicode frames", async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream = controller;
    },
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(body, { headers: { "Content-Type": "application/x-ndjson" } }),
      )
      .mockResolvedValueOnce(page([], 0)),
  );
  const onProgress = vi.fn<(progress: KayaImportProgress) => void>();
  const settled = vi.fn<() => void>();
  const result = fetchKayaImport("suzilu", { ...options(), onProgress });
  void result.then(settled, settled);
  const data = new TextEncoder().encode(
    JSON.stringify({ type: "profile", username: "suzilu" }) +
      "\n" +
      JSON.stringify({
        type: "page",
        total: 1,
        items: [ascent("1", "1", { comment: "Très fun" })],
      }) +
      "\n",
  );
  const split = data.findIndex((value) => value === 0xc3) + 1;
  stream.enqueue(data.slice(0, split));
  stream.enqueue(data.slice(split));
  await vi.waitFor(() =>
    expect(onProgress).toHaveBeenCalledWith({
      discipline: "boulder",
      loaded: 1,
      total: 1,
      retry: null,
    }),
  );
  expect(settled).not.toHaveBeenCalled();
  stream.enqueue(new TextEncoder().encode('{"type":"complete","total":1}\n'));
  stream.close();
  expect((await result).parsed.rows[0].Comments).toBe("Très fun");
});

it("discards streamed rows if the completion marker is missing or a later error arrives", async () => {
  for (const ending of [
    "",
    JSON.stringify({ type: "error", error: "KAYA is unavailable. Try again." }) + "\n",
  ]) {
    const body =
      [
        JSON.stringify({ type: "profile", username: "suzilu" }),
        JSON.stringify({ type: "page", total: 1, items: [ascent("1")] }),
      ].join("\n") +
      "\n" +
      ending;
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(body, { headers: { "Content-Type": "application/x-ndjson" } }),
        ),
    );
    await expect(fetchKayaImport("suzilu", options())).rejects.toThrow(/complete|unavailable/i);
  }
});

it("keeps a live stream open beyond two minutes when heartbeats arrive", async () => {
  vi.useFakeTimers();
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream = controller;
    },
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(body, { headers: { "Content-Type": "application/x-ndjson" } }),
      )
      .mockResolvedValueOnce(page([], 0)),
  );
  const result = fetchKayaImport("suzilu", options());
  try {
    for (let i = 0; i < 4; i += 1) {
      await vi.advanceTimersByTimeAsync(40_000);
      stream.enqueue(new TextEncoder().encode('{"type":"heartbeat"}\n'));
      await vi.advanceTimersByTimeAsync(0);
    }
    stream.enqueue(
      new TextEncoder().encode(
        '{"type":"profile","username":"suzilu"}\n{"type":"page","items":[],"total":0}\n{"type":"complete","total":0}\n',
      ),
    );
    stream.close();
    expect((await result).parsed.rows).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

it("cancels a silent stream and discards its partial rows after the inactivity timeout", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn<() => void>();
  const body = new ReadableStream<Uint8Array>({ cancel });
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(body, { headers: { "Content-Type": "application/x-ndjson" } }),
      ),
  );
  const outcome = fetchKayaImport("suzilu", options()).catch((error: unknown) => error);
  try {
    await vi.advanceTimersByTimeAsync(45_000);
    expect(await outcome).toMatchObject({ message: "KAYA stopped responding. Please try again." });
    expect(cancel).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

it("uses the shared authentication-required error when the session expires", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: "Not signed in" }, { status: 401 })),
  );
  await expect(fetchKayaImport("suzilu", options())).rejects.toBeInstanceOf(
    AuthenticationRequiredError,
  );
});
