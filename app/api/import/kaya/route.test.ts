import { env } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { user } from "@/db/schema";
import type { KayaStreamEvent } from "@/lib/kaya-import-stream";
import { seedFixtureUser } from "@/test/fixtures";

vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

import { GET } from "./route";

const identity = vi.hoisted(() => ({ signedIn: true }));
vi.mock("@/lib/session", () => ({
  getSession: async () => (identity.signedIn ? { user: { id: "local" } } : null),
}));
const profile = (isPrivate = false) =>
  Response.json({ data: { webUser: { id: "1094", username: "suzilu", is_private: isPrivate } } });
const ascents = () =>
  Response.json({
    data: {
      webAscentsForUser: [{ id: "send-1" }],
      webFilterDistributionForAscents: { data: [{ ascent_count: 1 }] },
    },
  });
const request = (params = "username=suzilu&climbTypeId=1&offset=0") =>
  new Request(`https://betabook.ca/api/import/kaya?${params}`);
async function events(response: Response): Promise<KayaStreamEvent[]> {
  return (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}
beforeEach(async () => {
  identity.signedIn = true;
  const db = createDb(env.DB);
  await db.delete(user);
  await seedFixtureUser(db, { id: "local" });
});
afterEach(() => vi.unstubAllGlobals());

it("requires sign-in before contacting KAYA", async () => {
  identity.signedIn = false;
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  const result = await GET(request());
  expect(result.status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});
it("uses fixed public queries, outdoor filters, page size and no credentials", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(profile())
    .mockResolvedValueOnce(ascents());
  vi.stubGlobal("fetch", fetcher);
  const result = await GET(request());
  expect(result.status).toBe(200);
  expect(result.headers.get("Cache-Control")).toBe("private, no-store, no-transform");
  expect(await events(result)).toEqual([
    { type: "heartbeat" },
    { type: "profile", username: "suzilu" },
    { type: "page", items: [{ id: "send-1" }], total: 1 },
    { type: "complete", total: 1 },
  ]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (const [url, init] of fetcher.mock.calls) {
    expect(url).toBe("https://kaya-beta.kayaclimb.com/graphql");
    expect(init).toMatchObject({ method: "POST", credentials: "omit", redirect: "manual" });
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    expect(new Headers(init?.headers).has("cookie")).toBe(false);
  }
  const body = JSON.parse(fetcher.mock.calls[1][1]!.body as string);
  expect(body.variables).toEqual({
    userId: "1094",
    climbTypeId: "1",
    offset: 0,
    includeTotal: true,
  });
  expect(body.query).toContain("filter_by: OUTDOOR");
  expect(body.query).toContain("count: 100");
});
it("refuses a private profile before requesting ascents", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(profile(true))
    .mockResolvedValueOnce(ascents());
  vi.stubGlobal("fetch", fetcher);
  const result = await GET(request());
  expect(result.status).toBe(200);
  expect((await events(result)).at(-1)).toEqual({
    type: "error",
    error: expect.stringMatching(/public profile/i),
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  "username=https://evil.test&climbTypeId=1&offset=0",
  "username=suzilu&climbTypeId=3&offset=0",
  "username=..%2Fadmin&climbTypeId=1",
  "username=&climbTypeId=1",
  "username=suzilu&climbTypeId=",
])("validates input before fetching: %s", async (params) => {
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  expect((await GET(request(params))).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
it("rejects GraphQL partial errors, missing profiles, and oversized responses without exposing upstream details", async () => {
  for (const response of [
    Response.json({ data: { webUser: null } }),
    Response.json({
      data: { webUser: { id: "1094" } },
      errors: [{ message: "Internal private diagnostic" }],
    }),
    new Response("too large", { headers: { "content-length": "2000000" } }),
  ]) {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));
    const result = await GET(request());
    expect(result.status).toBe(200);
    expect((await events(result)).at(-1)).toEqual({
      type: "error",
      error: expect.stringMatching(/KAYA.*profile|KAYA.*format/),
    });
  }
});
it("rejects cancellation before requesting a public profile", async () => {
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  controller.abort();
  const input = new Request(request(), { signal: controller.signal });
  expect((await events(await GET(input))).at(-1)).toMatchObject({ type: "error" });
  expect(fetcher).not.toHaveBeenCalled();
});

it("paginates outdoor ascents without repeating the profile lookup", async () => {
  const batch = Array.from({ length: 100 }, (_, i) => ({ id: String(i) }));
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(profile())
    .mockResolvedValueOnce(
      Response.json({
        data: {
          webAscentsForUser: batch,
          webFilterDistributionForAscents: { data: [{ ascent_count: 101 }] },
        },
      }),
    )
    .mockResolvedValueOnce(Response.json({ data: { webAscentsForUser: [{ id: "last" }] } }));
  vi.stubGlobal("fetch", fetcher);
  const result = await GET(request("username=suzilu&climbTypeId=2"));
  expect(result.status).toBe(200);
  expect(await events(result)).toEqual([
    { type: "heartbeat" },
    { type: "profile", username: "suzilu" },
    { type: "page", total: 101, items: batch },
    { type: "page", total: 101, items: [{ id: "last" }] },
    { type: "complete", total: 101 },
  ]);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(JSON.parse(fetcher.mock.calls[2][1]!.body as string).variables).toEqual({
    userId: "1094",
    climbTypeId: "2",
    offset: 100,
    includeTotal: false,
  });
});
it("rejects a truncated history before returning any ascents", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(profile())
      .mockResolvedValueOnce(
        Response.json({
          data: {
            webAscentsForUser: [{ id: "1" }],
            webFilterDistributionForAscents: { data: [{ ascent_count: 2 }] },
          },
        }),
      ),
  );
  const result = await GET(request());
  expect(result.status).toBe(200);
  expect((await events(result)).at(-1)).toEqual({
    type: "error",
    error: expect.stringMatching(/complete KAYA history/),
  });
});

it("returns a streaming response for the public import", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValueOnce(profile()).mockResolvedValueOnce(ascents()),
  );
  const result = await GET(request());
  expect(result.headers.get("Content-Type")).toContain("application/x-ndjson");
  await result.arrayBuffer();
});

it("streams a retry notice and heartbeats during backoff, and cancellation stops the retry", async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () => new Response("slow down", { status: 429, headers: { "Retry-After": "60" } }),
    );
  vi.stubGlobal("fetch", fetcher);
  try {
    const response = await GET(request());
    const reader = response.body!.getReader();
    const next = async () => JSON.parse(new TextDecoder().decode((await reader.read()).value));
    expect(await next()).toEqual({ type: "heartbeat" });
    expect(await next()).toMatchObject({
      type: "retry",
      reason: "rate-limit",
      attempt: 1,
      delayMs: 60_000,
    });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await next()).toEqual({ type: "heartbeat" });
    await reader.cancel();
    await vi.runAllTimersAsync();
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
