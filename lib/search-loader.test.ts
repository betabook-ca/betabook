import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { EMPTY_SEARCH } from "@/lib/search";
import { seedFixtureFriendship, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { loadClimberSuggestions } from "./search-loader";

vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureUser(db, { id: "viewer" });
  await seedFixtureUser(db, { id: "partner" });
  await seedFixtureUser(db, { id: "crag-mate", name: "Crag Mate" });
  await seedFixtureFriendship(db, "viewer", "partner");
  await seedFixtureFriendship(db, "partner", "crag-mate");
});

it("loads suggestions only when the search shows them", async () => {
  const climbers = { ...EMPTY_SEARCH, category: "climber" as const };
  const expected = [
    {
      id: "crag-mate",
      name: "Crag Mate",
      image: null,
      friendshipStatus: "none",
      mutualFriendCount: 1,
    },
  ];
  expect(await loadClimberSuggestions(climbers, "viewer")).toEqual(expected);
  expect(await loadClimberSuggestions(climbers, null)).toBeNull();
  expect(await loadClimberSuggestions({ ...climbers, category: "climb" }, "viewer")).toBeNull();
});
