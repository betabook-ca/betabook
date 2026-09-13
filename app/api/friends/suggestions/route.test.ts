import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { seedFixtureFriendship, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { GET } from "./route";

const identity = vi.hoisted(() => ({ id: "viewer" as string | null }));
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
  identity.id = "viewer";
  await seedFixtureUser(db, { id: "viewer", name: "Viewer" });
  await seedFixtureUser(db, { id: "partner", name: "Partner" });
  await seedFixtureUser(db, { id: "crag-mate", name: "Crag Mate" });
  await seedFixtureFriendship(db, "viewer", "partner");
  await seedFixtureFriendship(db, "partner", "crag-mate");
});

it("requires sign-in and uses a private no-store response", async () => {
  identity.id = null;
  const response = await GET();
  expect(response.status).toBe(401);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it("returns suggestions for the signed-in viewer only", async () => {
  const response = await GET();
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({
    climbers: [
      {
        id: "crag-mate",
        name: "Crag Mate",
        image: null,
        friendshipStatus: "none",
        mutualFriendCount: 1,
      },
    ],
  });
  identity.id = "crag-mate";
  expect(await (await GET()).json()).toMatchObject({ climbers: [{ id: "viewer" }] });
});
