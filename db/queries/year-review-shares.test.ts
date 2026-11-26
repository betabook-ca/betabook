import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { user, yearReviewShareLinks } from "@/db/schema";
import { seedFixtureSend, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getYearReviewData } from "./year-in-review";
import { getSharedYearReview, getYearReviewShareForOwner } from "./year-review-shares";

const db = createDb(env.DB);

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "owner", name: "Share Owner" });
  await seedFixtureSend(db, { userId: "owner", climbId: 1, dateSent: "2026-05-01" });
});

async function share(expiresAt: string | null = null) {
  const [row] = await db
    .insert(yearReviewShareLinks)
    .values({ userId: "owner", year: 2026, expiresAt })
    .returning({ token: yearReviewShareLinks.token });
  return row.token;
}

it("resolves a live link to its owner and year, and the owner's dialog sees it", async () => {
  const token = await share();
  expect(await getSharedYearReview(db, token)).toEqual({
    status: "visible",
    owner: { id: "owner", name: "Share Owner", image: null },
    year: 2026,
  });
  expect(await getYearReviewShareForOwner(db, "owner", 2026)).toMatchObject({ token });
  expect(await getYearReviewShareForOwner(db, "owner", 2025)).toBeNull();
});

it("reads the recap's rows through the link only while it is live", async () => {
  const token = await share();
  const live = await getYearReviewData(db, { ownerId: "owner", token }, 2026);
  expect(live.sends.map((send) => send.climbId)).toEqual([1]);
  expect(live.areas.get(4)?.path).toEqual([1, 2, 4]);

  await db
    .update(yearReviewShareLinks)
    .set({ expiresAt: sql`datetime('now', '-1 minute')` })
    .where(eq(yearReviewShareLinks.token, token));
  expect(await getSharedYearReview(db, token)).toEqual({
    status: "expired",
    ownerId: "owner",
    year: 2026,
  });
  const dead = await getYearReviewData(db, { ownerId: "owner", token }, 2026);
  expect(dead.sends).toEqual([]);
  expect(dead.areas.size).toBe(0);
});

it("revokes every link when the profile goes private", async () => {
  const token = await share();
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));
  expect(await getSharedYearReview(db, token)).toEqual({ status: "hidden" });
  expect(await db.select().from(yearReviewShareLinks)).toEqual([]);
});

it("hides an unknown token", async () => {
  expect(await getSharedYearReview(db, "0".repeat(32))).toEqual({ status: "hidden" });
});
