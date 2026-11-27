import { env } from "cloudflare:test";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDb, type Database } from "@/db/client";
import { climbs, sends } from "@/db/schema";
import { seedFixtureTree, seedFixtureUser } from "@/test/fixtures";

/**
 * climbs.sendCount/ratingSum/ratingCount are maintained entirely by the
 * triggers from 0014_sends_aggregate_triggers — no app code writes them.
 * These tests go straight at `sends` (no mutation, no session) and assert
 * the invariant holds, which is the part that used to be duplicated by hand
 * at every write path.
 */

let db: Database;

const CLIMB = 1; // Test Highball, from seedFixtureTree
const OTHER_CLIMB = 2; // Test Slab

beforeAll(async () => {
  db = createDb(env.DB);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "agg-user-1", name: "Aggregate User One" });
  await seedFixtureUser(db, { id: "agg-user-2", name: "Aggregate User Two" });
  await seedFixtureUser(db, { id: "agg-user-3", name: "Aggregate User Three" });
});

beforeEach(async () => {
  await db.delete(sends);
});

async function seedRatings(ratings: (number | null)[]) {
  for (const [i, rating] of ratings.entries()) await insertSend(`agg-user-${i + 1}`, CLIMB, rating);
}

async function aggregates(climbId: number) {
  const row = await db
    .select({
      sendCount: climbs.sendCount,
      ratingSum: climbs.ratingSum,
      ratingCount: climbs.ratingCount,
      avgRating: climbs.avgRating,
    })
    .from(climbs)
    .where(eq(climbs.id, climbId))
    .get();
  return row!;
}

function insertSend(userId: string, climbId: number, rating: number | null) {
  return db.insert(sends).values({
    userId,
    climbId,
    ascentStyle: "redpoint",
    dateSent: null,
    rating,
    suggestedGrade: 2,
  });
}

function sendFor(userId: string, climbId: number) {
  return and(eq(sends.userId, userId), eq(sends.climbId, climbId));
}

describe("sends aggregate triggers", () => {
  it("starts at zero, with a null average", async () => {
    expect(await aggregates(CLIMB)).toEqual({
      sendCount: 0,
      ratingSum: 0,
      ratingCount: 0,
      avgRating: null,
    });
  });

  it("counts an insert with a rating", async () => {
    await insertSend("agg-user-1", CLIMB, 4);
    expect(await aggregates(CLIMB)).toEqual({
      sendCount: 1,
      ratingSum: 4,
      ratingCount: 1,
      avgRating: 4,
    });
  });

  it("counts an insert with a null rating without moving the rating totals", async () => {
    await seedRatings([4]);
    await insertSend("agg-user-2", CLIMB, null);
    expect(await aggregates(CLIMB)).toEqual({
      sendCount: 2,
      ratingSum: 4,
      ratingCount: 1,
      avgRating: 4,
    });
  });

  it("averages across several rated sends on one climb", async () => {
    await seedRatings([4, null]);
    await insertSend("agg-user-3", CLIMB, 5);
    expect(await aggregates(CLIMB)).toEqual({
      sendCount: 3,
      ratingSum: 9,
      ratingCount: 2,
      avgRating: 4.5,
    });
  });

  it("leaves other climbs untouched", async () => {
    await seedRatings([4, null, 5]);
    expect(await aggregates(OTHER_CLIMB)).toEqual({
      sendCount: 0,
      ratingSum: 0,
      ratingCount: 0,
      avgRating: null,
    });
  });

  it("moves ratingCount up when an update fills in a null rating", async () => {
    await seedRatings([4, null, 5]);
    await db.update(sends).set({ rating: 3 }).where(sendFor("agg-user-2", CLIMB));
    expect(await aggregates(CLIMB)).toEqual({
      sendCount: 3,
      ratingSum: 12,
      ratingCount: 3,
      avgRating: 4,
    });
  });

  it("swaps one rating for another without touching sendCount or ratingCount", async () => {
    await seedRatings([4, 3, 5]);
    await db.update(sends).set({ rating: 1 }).where(sendFor("agg-user-3", CLIMB));
    expect(await aggregates(CLIMB)).toEqual({
      sendCount: 3,
      ratingSum: 8,
      ratingCount: 3,
      avgRating: 8 / 3,
    });
  });

  it("moves ratingCount down when an update clears a rating", async () => {
    await seedRatings([4, 3, 1]);
    await db.update(sends).set({ rating: null }).where(sendFor("agg-user-3", CLIMB));
    expect(await aggregates(CLIMB)).toEqual({
      sendCount: 3,
      ratingSum: 7,
      ratingCount: 2,
      avgRating: 3.5,
    });
  });

  it("ignores an update that doesn't touch the rating", async () => {
    await seedRatings([4, 3, null]);
    await db.update(sends).set({ ascentStyle: "flash" }).where(sendFor("agg-user-1", CLIMB));
    expect(await aggregates(CLIMB)).toEqual({
      sendCount: 3,
      ratingSum: 7,
      ratingCount: 2,
      avgRating: 3.5,
    });
  });

  it("moves both climbs when a send changes climb", async () => {
    await seedRatings([4, 3, null]);
    await db.update(sends).set({ climbId: OTHER_CLIMB }).where(sendFor("agg-user-1", CLIMB));
    expect(await aggregates(CLIMB)).toEqual({
      sendCount: 2,
      ratingSum: 3,
      ratingCount: 1,
      avgRating: 3,
    });
    expect(await aggregates(OTHER_CLIMB)).toEqual({
      sendCount: 1,
      ratingSum: 4,
      ratingCount: 1,
      avgRating: 4,
    });
  });

  it("backs a rated send out on delete", async () => {
    await seedRatings([4, 3, null]);
    await db.delete(sends).where(sendFor("agg-user-1", CLIMB));
    expect(await aggregates(CLIMB)).toEqual({
      sendCount: 2,
      ratingSum: 3,
      ratingCount: 1,
      avgRating: 3,
    });
  });

  it("backs an unrated send out on delete without moving rating totals", async () => {
    await insertSend("agg-user-2", CLIMB, 3);
    await insertSend("agg-user-3", CLIMB, null);
    await db.delete(sends).where(sendFor("agg-user-3", CLIMB));
    expect(await aggregates(CLIMB)).toEqual({
      sendCount: 1,
      ratingSum: 3,
      ratingCount: 1,
      avgRating: 3,
    });
  });

  it("returns to zero — and a null average — once every send is gone", async () => {
    await insertSend("agg-user-2", CLIMB, 3);
    await db.delete(sends).where(sendFor("agg-user-2", CLIMB));
    expect(await aggregates(CLIMB)).toEqual({
      sendCount: 0,
      ratingSum: 0,
      ratingCount: 0,
      avgRating: null,
    });
  });

  it("agrees with a live aggregate over sends after a mixed sequence", async () => {
    await insertSend("agg-user-1", CLIMB, 2);
    await insertSend("agg-user-2", CLIMB, null);
    await insertSend("agg-user-3", CLIMB, 5);
    await db.update(sends).set({ rating: 4 }).where(sendFor("agg-user-2", CLIMB));
    await db.delete(sends).where(sendFor("agg-user-1", CLIMB));

    const [live] = await db.all<{
      sendCount: number;
      ratingSum: number;
      ratingCount: number;
    }>(sql`
      SELECT COUNT(*) AS sendCount,
             COALESCE(SUM(rating), 0) AS ratingSum,
             COUNT(rating) AS ratingCount
      FROM sends WHERE climb_id = ${CLIMB}
    `);

    const stored = await aggregates(CLIMB);
    expect({
      sendCount: stored.sendCount,
      ratingSum: stored.ratingSum,
      ratingCount: stored.ratingCount,
    }).toEqual(live);
  });
});
