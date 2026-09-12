import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { GET } from "@/app/api/users/[id]/goals/route";
import { createDb } from "@/db/client";
import { goals, friendships } from "@/db/schema";
import { seedFixtureUser, seedFixtureFriendship } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const state = vi.hoisted(() => ({ viewer: "friend" as string | null }));
vi.mock("@/lib/session", () => ({
  getSession: async () => (state.viewer ? { user: { id: state.viewer } } : null),
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);
const params = { params: Promise.resolve({ id: "owner" }) };
const request = (query = "") => new Request(`https://betabook.ca/api/users/owner/goals?${query}`);
beforeEach(async () => {
  state.viewer = "friend";
  await resetDb(db);
  await seedFixtureUser(db, { id: "owner", journalVisibility: "friends" });
  await seedFixtureUser(db, { id: "friend" });
  await db.insert(goals).values({
    userId: "owner",
    kind: "training",
    target: 2,
    timeframe: "month",
    repeat: "none",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    timezone: "UTC",
  });
});
it("requires a member and current journal access on every page", async () => {
  expect((await GET(request("viewerId=owner"), params)).status).toBe(404);
  await seedFixtureFriendship(db, "owner", "friend");
  const response = await GET(request(), params);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ goals: [{ userId: "owner", target: 2 }] });
  await db.delete(friendships);
  expect((await GET(request("view=completed&offset=5"), params)).status).toBe(404);
  expect((await GET(request("goalId=1&periodStart=2026-09-01"), params)).status).toBe(404);
  state.viewer = null;
  expect((await GET(request(), params)).status).toBe(401);
});

it("validates history/year paging and protects history after access changes", async () => {
  await seedFixtureFriendship(db, "owner", "friend");
  for (const query of [
    "historyId=0",
    "historyId=1&offset=-1",
    "view=completed&year=oops",
    "year=10000",
  ])
    expect((await GET(request(query), params)).status).toBe(400);
  expect((await GET(request("historyId=999"), params)).status).toBe(200);
  await db.delete(friendships);
  expect((await GET(request("historyId=1&year=2026"), params)).status).toBe(404);
});
