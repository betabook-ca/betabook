import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { getProfileShareToken } from "@/db/queries";
import { seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getOwnProfileShareUrl, getOwnTripShareUrl } from "./profile-share-url";

vi.mock("@/lib/app-url", () => ({ getBaseUrl: async () => "https://betabook.test" }));

const db = createDb(env.DB);
const OWNER = { id: "owner", isPrivate: false };

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureUser(db, { id: "owner", name: "Trip Owner" });
});

it("opens the owner's profile link on one of their trips", async () => {
  const token = (await getProfileShareToken(db, "owner"))!;

  expect(await getOwnTripShareUrl(db, OWNER, 7)).toBe(
    `https://betabook.test/users/owner/trips/7?share=${token}`,
  );
  // One link: the trip's is the profile's, pointed somewhere else.
  expect(await getOwnProfileShareUrl(db, OWNER)).toBe(
    `https://betabook.test/users/owner?share=${token}`,
  );
});

it("has no link to give while the profile is private", async () => {
  await db.run(sql`UPDATE user SET is_private = 1 WHERE id = 'owner'`);

  expect(await getOwnTripShareUrl(db, { ...OWNER, isPrivate: true }, 7)).toBeNull();
});
