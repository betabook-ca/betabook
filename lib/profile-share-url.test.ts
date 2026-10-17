import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { getProfileShareToken } from "@/db/queries";
import { seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getOwnProfileShareUrl, getOwnTripShareUrl, tripShareOff } from "./profile-share-url";

vi.mock("@/lib/app-url", () => ({ getBaseUrl: async () => "https://betabook.test" }));

const db = createDb(env.DB);
const OWNER = { id: "owner", isPrivate: false, tripVisibility: "public" as const };

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureUser(db, { id: "owner", name: "Trip Owner" });
});

it("builds the trip share URL from the profile share token", async () => {
  const token = (await getProfileShareToken(db, "owner"))!;

  expect(await getOwnTripShareUrl(db, OWNER, 7)).toBe(
    `https://betabook.test/users/owner/trips/7?share=${token}`,
  );
  // The trip URL uses the same token as the profile URL.
  expect(await getOwnProfileShareUrl(db, OWNER)).toBe(
    `https://betabook.test/users/owner?share=${token}`,
  );
});

it("returns null when the profile is private", async () => {
  await db.run(sql`UPDATE user SET is_private = 1 WHERE id = 'owner'`);

  expect(await getOwnTripShareUrl(db, { ...OWNER, isPrivate: true }, 7)).toBeNull();
});

it("returns null unless trips are shared with Members, which is all the link reaches", async () => {
  for (const tripVisibility of ["friends", "private"] as const) {
    expect(await getOwnTripShareUrl(db, { ...OWNER, tripVisibility }, 7)).toBeNull();
    expect(tripShareOff({ ...OWNER, tripVisibility })).toBe("trips");
  }
  expect(tripShareOff(OWNER)).toBeNull();
  expect(tripShareOff({ ...OWNER, isPrivate: true, tripVisibility: "friends" })).toBe("private");
  // The profile link itself still works.
  expect(await getOwnProfileShareUrl(db, OWNER)).not.toBeNull();
});
