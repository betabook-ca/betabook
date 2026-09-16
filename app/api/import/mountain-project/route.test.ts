import { env } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { user } from "@/db/schema";
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

const TICKS =
  'Date,Route,Rating,Notes,URL,Pitches,Location,"Avg Stars","Your Stars",Style,"Lead Style","Route Type","Your Rating",Length,"Rating Code"\n2026-09-12,"Double Play",V6,,https://www.mountainproject.com/route/1/x,1,"Exit 38",3.3,3,Send,,Boulder,V6,12,20600';
const profileRedirect = () =>
  new Response(null, {
    status: 301,
    headers: { Location: "https://www.mountainproject.com/user/200226064/eric-bonilla" },
  });
const tickExport = () =>
  new Response(TICKS, { headers: { "Content-Type": "text/csv; charset=UTF-8" } });
const request = (params = "userId=200226064") =>
  new Request(`https://betabook.ca/api/import/mountain-project?${params}`);

beforeEach(async () => {
  identity.signedIn = true;
  const db = createDb(env.DB);
  await db.delete(user);
  await seedFixtureUser(db, { id: "local" });
});
afterEach(() => vi.unstubAllGlobals());

it("requires sign-in before contacting Mountain Project", async () => {
  identity.signedIn = false;
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  const result = await GET(request());
  expect(result.status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});

it("returns the tick export and the resolved profile name", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(profileRedirect())
    .mockResolvedValueOnce(tickExport());
  vi.stubGlobal("fetch", fetcher);
  const result = await GET(request("userId=https://www.mountainproject.com/user/200226064/eric"));
  expect(result.status).toBe(200);
  expect(result.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
  expect(result.headers.get("X-Mountain-Project-User")).toBe("eric-bonilla");
  expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await result.text()).toBe(TICKS);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    "https://www.mountainproject.com/user/200226064",
    "https://www.mountainproject.com/user/200226064/eric-bonilla/tick-export",
  ]);
});

it("rejects a user ID it cannot parse without contacting Mountain Project", async () => {
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  const result = await GET(request("userId=../../admin"));
  expect(result.status).toBe(400);
  expect(await result.json()).toEqual({
    error: "Enter a valid Mountain Project user ID or profile link.",
  });
  expect(fetcher).not.toHaveBeenCalled();
});

it("returns the upstream failure as a message the wizard can show", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 404 })),
  );
  const result = await GET(request());
  // A mistyped profile is the caller's error, not an upstream outage.
  expect(result.status).toBe(404);
  expect(await result.json()).toEqual({
    error: "That Mountain Project profile could not be found. Check the user ID or profile link.",
  });
});

it("reports a failed connection without leaking internals", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(() => {
      throw new RangeError("boom");
    }),
  );
  const result = await GET(request());
  expect(result.status).toBe(502);
  expect(await result.json()).toEqual({
    error: "Couldn't connect to Mountain Project. Please try again, or email support@betabook.ca.",
  });
});
