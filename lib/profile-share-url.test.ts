import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { getProfileShareToken } from "@/db/queries";
import { seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getOwnProfileShareUrl } from "./profile-share-url";

vi.mock("@/lib/app-url", () => ({ getBaseUrl: async () => "https://betabook.test" }));

const db = createDb(env.DB);
const OWNER = { id: "owner", isPrivate: false };

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureUser(db, { id: "owner", name: "Profile Owner" });
});

it("builds the profile share URL from the profile share token", async () => {
  const token = (await getProfileShareToken(db, "owner"))!;

  expect(await getOwnProfileShareUrl(db, OWNER)).toBe(
    `https://betabook.test/users/owner?share=${token}`,
  );
});

it("returns null when the profile is private", async () => {
  await db.run(sql`UPDATE user SET is_private = 1 WHERE id = 'owner'`);

  expect(await getOwnProfileShareUrl(db, { ...OWNER, isPrivate: true })).toBeNull();
});
