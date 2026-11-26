import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchSendageImport } from "./sendage-import";
import { parseSendageUsername } from "./sendage-profile";
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS } from "./sends-import";

const envelope = (json: unknown) => Response.json({ result: { data: { json } } });
const profile = (extra = {}) =>
  envelope({ profile: { id: 42, slug: "climber", isPrivate: false, totalSends: 2, ...extra } });
function send(id: number, extra = {}) {
  return {
    id: id + 100,
    climb: {
      id,
      name: `Climb ${id}`,
      type: "sport",
      gradeId: 62,
      area: { name: "Wall", parent: { name: "Crag" } },
    },
    sendType: "onsight",
    gradeId: 51,
    day: "2026-08-16",
    rating: 0,
    difficulty: -1,
    comments: "Nice &amp; sunny",
    beta: "High foot",
    attempts: 1,
    firstAscent: false,
    ...extra,
  };
}
const activityDay = (day: string, sends: unknown[]) => ({ type: "sends", day, assets: [], sends });
const inputOf = (url: string) => JSON.parse(new URL(url).searchParams.get("input")!).json;
const options = () => ({ signal: new AbortController().signal });
afterEach(() => vi.unstubAllGlobals());

describe("Sendage import", () => {
  it("rejects an oversized advertised history before fetching activity", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(profile({ totalSends: MAX_IMPORT_ROWS + 1 }))
      .mockResolvedValueOnce(envelope({ items: [activityDay("2026-08-16", [send(1)])] }));
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchSendageImport("climber", options())).rejects.toThrow(/too large/i);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("caps actual rows even when the profile underreports its total", async () => {
    let page = 0;
    let count = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      page += 1;
      if (page === 1) return profile({ totalSends: 0 });
      const amount = Math.min(1000, MAX_IMPORT_ROWS + 1 - count);
      const rows = Array.from({ length: amount }, () => {
        count += 1;
        const id = count;
        return {
          id,
          sendType: "redpoint",
          climb: { id, name: "x", type: "boulder", area: { name: "x" }, gradeId: 1 },
          gradeId: 1,
          day: null,
          rating: 0,
          difficulty: 0,
        };
      });
      return envelope({
        items: [activityDay("2026-01-01", rows)],
        nextCursor:
          count <= MAX_IMPORT_ROWS
            ? { day: new Date(Date.UTC(2026, 8, 16 - page)).toISOString().slice(0, 10) }
            : null,
      });
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchSendageImport("climber", options()).then(() => "completed")).rejects.toThrow(
      /too large/i,
    );
    expect(count).toBe(MAX_IMPORT_ROWS + 1);
  });

  it("bounds UTF-8 bytes while streaming and cancels before consuming an oversized page", async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        result: {
          data: {
            json: {
              items: [activityDay("2026-08-16", [send(1, { comments: "é".repeat(1_200_000) })])],
            },
          },
        },
      }),
    );
    let offset = 0;
    const cancel = vi.fn<() => void>();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === bytes.length) controller.close();
        else {
          const end = Math.min(bytes.length, offset + 64 * 1024);
          controller.enqueue(bytes.slice(offset, end));
          offset = end;
        }
      },
      cancel,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(profile({ totalSends: 1 }))
        .mockResolvedValueOnce(new Response(body)),
    );
    await expect(fetchSendageImport("climber", options()).then(() => "completed")).rejects.toThrow(
      /too large/i,
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(offset).toBeLessThan(bytes.length);
  });

  it("limits the combined download instead of accepting unlimited individually small pages", async () => {
    const pages = 8;
    const comment = "x".repeat(Math.ceil(MAX_IMPORT_FILE_BYTES / 7));
    let calls = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return profile({ totalSends: pages });
      const day = `2026-08-${String(20 - calls).padStart(2, "0")}`;
      return envelope({
        items: [activityDay(day, [send(calls, { comments: comment })])],
        nextCursor: calls <= pages ? { day } : null,
      });
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchSendageImport("climber", options()).then(() => "completed")).rejects.toThrow(
      /too large/i,
    );
    expect(fetcher.mock.calls.length).toBeLessThan(pages + 1);
  });

  it("downloads every activity page without credentials and preserves personal send values", async () => {
    const fetcher = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(profile())
      .mockResolvedValueOnce(
        envelope({
          items: [activityDay("2026-08-16", [send(1)])],
          nextCursor: { day: "2026-08-16" },
        }),
      )
      .mockResolvedValueOnce(
        envelope({ items: [activityDay("0000-00-00", [send(2, { day: null, rating: 5 })])] }),
      );
    vi.stubGlobal("fetch", fetcher);
    const onProgress = vi.fn<(count: number) => void>();
    const result = await fetchSendageImport("https://sendage.com/user/climber?tab=sends", {
      ...options(),
      onProgress,
    });
    expect(result.username).toBe("climber");
    expect(result.parsed.rows).toHaveLength(2);
    expect(result.parsed.rows[0]).toMatchObject({
      Climb: "Climb 1",
      Date: "2026-08-16",
      "Send Type": "onsight",
      Grade: "5.11b",
      "Posted Grade": "5.12a",
      Rating: "",
      "Grade Feel": "low-end",
      Comments: "Nice &amp; sunny",
      Area: "Wall",
      Region: "Crag",
      Beta: "High foot",
    });
    expect(result.parsed.rows[1]).toMatchObject({ Climb: "Climb 2", Date: "", Rating: "5" });
    expect(result.parsed.warnings).toEqual([expect.stringMatching(/beta, attempts/)]);
    expect(onProgress).toHaveBeenLastCalledWith(2);
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [url, init] of fetcher.mock.calls) {
      expect(new URL(url).origin).toBe("https://sendage.com");
      expect(init?.credentials).toBe("omit");
    }
    expect(new URL(fetcher.mock.calls[1][0]).pathname).toBe("/api/v2/activity.getUserActivity");
    expect(inputOf(fetcher.mock.calls[1][0])).toEqual({ userId: 42 });
    expect(inputOf(fetcher.mock.calls[2][0])).toEqual({
      userId: 42,
      cursor: { day: "2026-08-16" },
    });
  });

  it("imports completed sends only and skips activity without sends", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(profile({ totalSends: 1 }))
        .mockResolvedValueOnce(
          envelope({
            items: [
              { type: "photos", day: "2026-08-17", assets: [{ asset: { id: 1 } }] },
              activityDay("2026-08-16", [
                send(1, { sendType: "project" }),
                send(2, { sendType: "repeat" }),
                send(3, { sendType: "redpoint" }),
              ]),
            ],
          }),
        ),
    );
    const result = await fetchSendageImport("climber", options());
    expect(result.parsed.rows).toEqual([
      expect.objectContaining({ Climb: "Climb 3", "Send Type": "redpoint" }),
    ]);
  });

  it("rejects private profiles before requesting their sends", async () => {
    const fetcher = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValue(profile({ isPrivate: true }));
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchSendageImport("climber", options())).rejects.toThrow(/public profile/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("points blocked activity requests to support", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(profile())
        .mockResolvedValueOnce(new Response("unauthorized", { status: 401 })),
    );
    await expect(fetchSendageImport("climber", options())).rejects.toThrow(
      /email support@betabook\.ca/,
    );
  });

  it("does not return partial rows when a later page fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<(url: string, init: RequestInit) => Promise<Response>>()
        .mockResolvedValueOnce(profile())
        .mockResolvedValueOnce(
          envelope({
            items: [activityDay("2026-08-16", [send(1)])],
            nextCursor: { day: "2026-08-16" },
          }),
        )
        .mockResolvedValueOnce(new Response("unavailable", { status: 503 })),
    );
    await expect(fetchSendageImport("climber", options())).rejects.toThrow(/try again/i);
  });

  it("warns with both counts when the feed returns fewer sends than the profile total", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(profile({ totalSends: 3 }))
        .mockResolvedValueOnce(
          envelope({ items: [activityDay("2026-08-16", [send(1, { beta: "" }), send(2)])] }),
        ),
    );
    const result = await fetchSendageImport("climber", options());
    expect(result.parsed.rows).toHaveLength(2);
    expect(result.parsed.warnings).toContainEqual(
      expect.stringMatching(/lists 3 sends.*returned 2.*support@betabook\.ca/),
    );
  });

  it("rejects an empty feed for a profile with sends", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(profile())
        .mockResolvedValueOnce(envelope({ items: [] })),
    );
    await expect(fetchSendageImport("climber", options())).rejects.toThrow(
      /complete.*support@betabook\.ca/i,
    );
  });

  it.each([
    ["the same day", [activityDay("2026-08-15", [send(2)])], { day: "2026-08-16" }],
    ["a newer day", [activityDay("2026-08-15", [send(2)])], { day: "2026-08-17" }],
    ["a malformed day", [activityDay("2026-08-15", [send(2)])], { day: "Aug 15" }],
    ["a page number", [activityDay("2026-08-15", [send(2)])], 2],
    ["an empty page", [], { day: "2026-08-01" }],
  ])("stops when the next cursor is %s", async (_, items, nextCursor) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(profile())
      .mockResolvedValueOnce(
        envelope({
          items: [activityDay("2026-08-16", [send(1)])],
          nextCursor: { day: "2026-08-16" },
        }),
      )
      .mockResolvedValueOnce(envelope({ items, nextCursor }));
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchSendageImport("climber", options())).rejects.toThrow(
      /complete.*support@betabook\.ca/i,
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["an activity without its type", { day: "2026-08-16", sends: [send(1)] }],
    ["a sends activity without sends", { type: "sends", day: "2026-08-16", assets: [] }],
    ["a send without details", activityDay("2026-08-16", [{ id: 101, climb: send(1).climb }])],
    ["an unknown send style", activityDay("2026-08-16", [send(1, { sendType: "tick" })])],
  ])("fails closed on %s", async (_, activity) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(profile({ totalSends: 1 }))
        .mockResolvedValueOnce(envelope({ items: [activity] })),
    );
    await expect(fetchSendageImport("climber", options())).rejects.toThrow(
      /format.*support@betabook\.ca/i,
    );
  });

  it.each([
    ["boulder", 12, "V0"],
    ["boulder", 13, "V1"],
    ["boulder", 62, "V10"],
    ["boulder", 63, "V11"],
    ["boulder", 96, "V17"],
    ["sport", 60, "5.11d"],
    ["sport", 61, "5.12a"],
    ["sport", 62, "5.12a"],
    ["sport", 65, "5.12a"],
    ["sport", 66, "5.12b"],
    ["trad", 62, "5.12a"],
    ["sport", 140, "5.15d"],
  ])(
    "maps published Sendage %s ID %s to %s without a grading preference",
    async (type, gradeId, label) => {
      const row = send(1, { gradeId });
      row.climb = { ...row.climb, type, gradeId };
      vi.stubGlobal(
        "fetch",
        vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(profile({ totalSends: 1 }))
          .mockResolvedValueOnce(envelope({ items: [activityDay("2026-08-16", [row])] })),
      );
      const result = await fetchSendageImport("climber", options());
      expect(result.parsed.rows[0]).toMatchObject({ Grade: label, "Posted Grade": label });
    },
  );

  it.each([
    ["boulder", 97],
    ["sport", 141],
    ["trad", 141],
    ["sport", 0],
    ["sport", 1.5],
    ["sport", "62"],
    ["sport", null],
  ])("stops on an unknown or invalid %s grade ID %s", async (type, gradeId) => {
    const row = send(1, { gradeId });
    row.climb.type = type;
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(profile({ totalSends: 1 }))
        .mockResolvedValueOnce(envelope({ items: [activityDay("2026-08-16", [row])] })),
    );
    await expect(fetchSendageImport("climber", options())).rejects.toThrow(
      /unknown.*grade ID.*Import stopped/i,
    );
  });

  it("discards earlier pages if a later climb has an unknown posted grade", async () => {
    const row = send(2);
    row.climb.gradeId = 141;
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(profile())
        .mockResolvedValueOnce(
          envelope({
            items: [activityDay("2026-08-16", [send(1)])],
            nextCursor: { day: "2026-08-16" },
          }),
        )
        .mockResolvedValueOnce(envelope({ items: [activityDay("2026-08-15", [row])] })),
    );
    await expect(fetchSendageImport("climber", options())).rejects.toThrow(
      /unknown.*grade ID.*Import stopped/i,
    );
  });

  it("honors cancellation before issuing a request", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchSendageImport("climber", { signal: controller.signal })).rejects.toThrow(
      /abort/i,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("cancels an activity reader that is waiting for the next streamed chunk", async () => {
    const controller = new AbortController();
    let bodyController!: ReadableStreamDefaultController<Uint8Array>;
    let reading!: () => void;
    const started = new Promise<void>((resolve) => {
      reading = resolve;
    });
    const cancel = vi.fn<() => void>();
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        bodyController = stream;
        stream.enqueue(new TextEncoder().encode('{"result":'));
      },
      pull() {
        if (body.locked) reading();
      },
      cancel,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(profile())
        .mockResolvedValueOnce(new Response(body)),
    );
    const result = fetchSendageImport("climber", { signal: controller.signal }).then(
      () => null,
      (error: unknown) => error,
    );
    await started;
    controller.abort();
    try {
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      if (!cancel.mock.calls.length)
        bodyController.error(new DOMException("Aborted", "AbortError"));
      expect(await result).toBe(controller.signal.reason);
    }
  });
});

describe("Sendage profile input", () => {
  it.each([
    "climber",
    " @climber ",
    "https://sendage.com/user/climber?tab=sends",
    "sendage.com/user/climber/",
  ])("normalizes %s", (input) => {
    expect(parseSendageUsername(input)).toBe("climber");
  });
  it.each([
    "",
    "https://evil.test/user/climber",
    "https://sendage.com.evil.test/user/climber",
    "https://sendage.com/profile?tab=sends",
    "https://name:pass@sendage.com/user/climber",
    "../admin",
    "https://sendage.com/user/a%2Fb",
  ])("rejects %s", (input) => {
    expect(() => parseSendageUsername(input)).toThrow(/Sendage|profile|username/i);
  });
});
