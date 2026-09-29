import { env } from "cloudflare:test";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { MAX_ALBUM_LINK } from "@/lib/trip-album";
import { seedFixtureTrip, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const db = createDb(env.DB);
const BISHOP = { userId: "owner", startDate: "2026-03-10", endDate: "2026-03-20" };

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureUser(db, { id: "owner" });
});

it("holds a link as long as the app accepts and refuses one longer", async () => {
  const longest = "h".repeat(MAX_ALBUM_LINK);
  expect((await seedFixtureTrip(db, { ...BISHOP, albumUrl: longest })).albumUrl).toBe(longest);

  await expect(seedFixtureTrip(db, { ...BISHOP, albumUrl: `${longest}h` })).rejects.toThrow(
    /Failed query/,
  );
});

it("needs no album", async () => {
  expect((await seedFixtureTrip(db, BISHOP)).id).toBeGreaterThan(0);
});
