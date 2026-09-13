import { afterEach, expect, it, vi } from "vitest";

import { fetchKayaAscents } from "./kaya-api";

const input = { username: "suzilu", climbTypeId: "1" };
const profile = () =>
  Response.json({ data: { webUser: { id: "1094", username: "suzilu", is_private: false } } });
const empty = () =>
  Response.json({ data: { webAscentsForUser: [], webFilterDistributionForAscents: { data: [] } } });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("honors Retry-After before retrying a rate-limited request", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response("slow down", { status: 429, headers: { "Retry-After": "12" } }),
    )
    .mockResolvedValueOnce(profile())
    .mockResolvedValueOnce(empty());
  vi.stubGlobal("fetch", fetcher);
  const outcome = fetchKayaAscents(input, new AbortController().signal).then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.advanceTimersByTimeAsync(11_999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await outcome).toMatchObject({ value: { username: "suzilu", total: 0 } });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("uses bounded exponential backoff for repeated rate limits", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response("rate limited", { status: 429 }));
  vi.stubGlobal("fetch", fetcher);
  const emit = vi.fn<(event: import("./kaya-import-stream").KayaStreamEvent) => void>();
  const outcome = fetchKayaAscents(input, new AbortController().signal, emit).catch(
    (error: unknown) => error,
  );
  await vi.runAllTimersAsync();
  expect(await outcome).toBeInstanceOf(Error);
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(emit.mock.calls.map(([event]) => event)).toEqual([
    { type: "retry", attempt: 1, delayMs: 5_000, reason: "rate-limit" },
    { type: "retry", attempt: 2, delayMs: 10_000, reason: "rate-limit" },
    { type: "retry", attempt: 3, delayMs: 20_000, reason: "rate-limit" },
  ]);
});

it("honors HTTP-date Retry-After and stops when the requested wait is too long", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response("busy", {
        status: 503,
        headers: { "Retry-After": "Tue, 08 Sep 2026 12:00:20 GMT" },
      }),
    )
    .mockResolvedValueOnce(profile())
    .mockResolvedValueOnce(empty());
  vi.stubGlobal("fetch", fetcher);
  const result = fetchKayaAscents(input, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(19_999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toMatchObject({ total: 0 });
  fetcher
    .mockReset()
    .mockResolvedValue(new Response("busy", { status: 429, headers: { "Retry-After": "121" } }));
  await expect(fetchKayaAscents(input, new AbortController().signal)).rejects.toThrow(
    /wait longer/i,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("retries the same failed page and never emits partial GraphQL data twice", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  const first = Array.from({ length: 100 }, (_, i) => ({ id: String(i) }));
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(profile())
    .mockResolvedValueOnce(
      Response.json({
        data: {
          webAscentsForUser: first,
          webFilterDistributionForAscents: { data: [{ ascent_count: 101 }] },
        },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        data: { webAscentsForUser: [{ id: "partial" }] },
        errors: [{ extensions: { code: "INTERNAL_SERVER_ERROR" } }],
      }),
    )
    .mockResolvedValueOnce(Response.json({ data: { webAscentsForUser: [{ id: "last" }] } }));
  vi.stubGlobal("fetch", fetcher);
  const emit = vi.fn<(event: import("./kaya-import-stream").KayaStreamEvent) => void>();
  const result = fetchKayaAscents(input, new AbortController().signal, emit);
  await vi.runAllTimersAsync();
  expect(await result).toMatchObject({ total: 101 });
  const pages = emit.mock.calls.map(([event]) => event).filter((event) => event.type === "page");
  expect(pages).toEqual([
    { type: "page", items: first, total: 101 },
    { type: "page", items: [{ id: "last" }], total: 101 },
  ]);
  expect(JSON.parse(fetcher.mock.calls[2][1]!.body as string).variables.offset).toBe(100);
  expect(JSON.parse(fetcher.mock.calls[3][1]!.body as string).variables.offset).toBe(100);
});

it("cancels a retry wait without issuing another request", async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("rate limited", { status: 429 }));
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  const result = fetchKayaAscents(input, controller.signal).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await vi.runAllTimersAsync();
  expect(await result).toMatchObject({ name: "AbortError" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("does not retry forbidden requests or incompatible GraphQL responses", async () => {
  for (const response of [
    new Response("forbidden", { status: 403 }),
    Response.json({ errors: [{ extensions: { code: "GRAPHQL_VALIDATION_FAILED" } }] }),
  ]) {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchKayaAscents(input, new AbortController().signal)).rejects.toThrow(
      /KAYA.*email support@betabook\.ca/,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
