import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { seedFixtureFriendship, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { GET } from "./route";

const identity = vi.hoisted(() => ({ id: "author" as string | null }));
vi.mock("@/lib/session", () => ({
  getSession: async () => (identity.id ? { user: { id: identity.id } } : null),
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  identity.id = "author";
  await seedFixtureUser(db, { id: "author" });
  await seedFixtureUser(db, { id: "partner", name: "Partner" });
  await seedFixtureFriendship(db, "author", "partner");
});
it("requires sign-in and uses a private no-store response", async () => {
  identity.id = null;
  const response = await GET(new Request("https://example.test/api/friends/companions?q=Par"));
  expect(response.status).toBe(401);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("returns accepted public friend identities and treats blank/wildcard input literally", async () => {
  const response = await GET(new Request("https://example.test/api/friends/companions?q=Par"));
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ friends: [{ id: "partner", name: "Partner" }] });
  for (const query of ["", "%25", "_", "x".repeat(500)]) {
    expect(
      await (
        await GET(new Request(`https://example.test/api/friends/companions?q=${query}`))
      ).json(),
    ).toEqual({ friends: [] });
  }
});
