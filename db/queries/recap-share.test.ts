import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { profileShareLinks, user } from "@/db/schema";
import type { RecapSnapshot } from "@/lib/recap-share";
import { seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { createRecapShare, getPublicProfileTokenForRecap, getRecapShare } from "./recap-share";

const db = createDb(env.DB);
const snapshot: RecapSnapshot = {
  version: 1,
  createdAt: "2026-09-20T12:00:00.000Z",
  owner: { name: "Share Owner", initials: "SO" },
  stats: {
    period: "year",
    periodLabel: "2026",
    sendCount: 1,
    daysOut: 1,
    disciplines: [
      {
        type: "boulder",
        sendCount: 1,
        hardest: { climbId: 1, grade: "V5", climbName: "Favorite Boulder" },
        favorites: [{ climbId: 1, climbName: "Favorite Boulder", rating: 5, grade: "V5" }],
      },
    ],
    calendar: {
      year: 2026,
      throughDate: "2026-09-20",
      highlightMonth: null,
      label: "2026 TO DATE",
      counts: { "2026-09-20": 1 },
    },
    longestStreak: null,
  },
};

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureUser(db, { id: "owner", name: "Share Owner" });
});

it("stores a frozen recap under a distinct bearer token", async () => {
  const profile = await getPublicProfileTokenForRecap(db, "owner");
  expect(profile).toMatchObject({ name: "Share Owner" });
  const token = await createRecapShare(db, "owner", profile!.token, snapshot);

  expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(await getRecapShare(db, token)).toEqual({
    snapshot,
    ownerId: "owner",
  });
  expect(await getRecapShare(db, "invalid")).toBeNull();
  expect(await getRecapShare(db, "A".repeat(22))).toBeNull();
});

it("revokes a recap after a privacy toggle or profile-link reset", async () => {
  const profile = (await getPublicProfileTokenForRecap(db, "owner"))!;
  const first = await createRecapShare(db, "owner", profile.token, snapshot);

  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));
  expect(await getPublicProfileTokenForRecap(db, "owner")).toBeNull();
  expect(await getRecapShare(db, first)).toBeNull();
  await db.update(user).set({ isPrivate: false }).where(eq(user.id, "owner"));
  expect(await getRecapShare(db, first)).toBeNull();

  const current = (await getPublicProfileTokenForRecap(db, "owner"))!;
  const second = await createRecapShare(db, "owner", current.token, snapshot);
  await db
    .update(profileShareLinks)
    .set({ token: "f".repeat(32) })
    .where(eq(profileShareLinks.userId, "owner"));
  expect(await getRecapShare(db, second)).toBeNull();
});
