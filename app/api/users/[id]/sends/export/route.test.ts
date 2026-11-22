import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { GET } from "./route";

vi.mock("@/lib/session", () => ({
  getSession: async () => ({ user: { id: "reader" } }),
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

const page = (query: string) =>
  GET(new Request(`https://betabook.ca/api/users/reader/sends/export?${query}`), {
    params: Promise.resolve({ id: "reader" }),
  });

beforeEach(async () => {
  const db = createDb(env.DB);
  await resetDb(db);
  await seedFixtureUser(db, { id: "reader" });
});

it("accepts a cursor on a real date or on an undated send", async () => {
  for (const query of ["", "afterId=1&afterDate=2024-02-29", "afterId=1&afterDate=null"]) {
    const response = await page(query);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sends: [] });
  }
});

it.each([
  "afterId=1&afterDate=2026-02-30",
  "afterId=1&afterDate=2026-13-01",
  "afterId=1",
  "afterDate=2026-01-01",
  "afterDate=null",
])("rejects the incomplete or impossible cursor %s", async (query) => {
  const response = await page(query);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Invalid export cursor" });
});
