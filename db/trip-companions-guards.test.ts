import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { friendships, tripCompanions, user } from "@/db/schema";
import { friendshipPair } from "@/lib/friendships";
import {
  seedFixtureFriendship,
  seedFixtureTree,
  seedFixtureTrip,
  seedFixtureUser,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const db = createDb(env.DB);
const BISHOP = { startDate: "2026-03-10", endDate: "2026-03-20" };

let tripId = 0;
let otherTripId = 0;

function insertCompanion(userId = "partner", suppressed = 0) {
  const pair = friendshipPair("owner", userId);
  return env.DB.prepare(
    `INSERT INTO trip_companions
      (trip_id, user_id, friendship_user_id, friendship_friend_id, suppressed)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (trip_id, user_id) DO NOTHING`,
  ).bind(tripId, userId, pair.userId, pair.friendId, suppressed);
}

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  for (const id of ["owner", "other", "partner"]) await seedFixtureUser(db, { id });
  await seedFixtureFriendship(db, "owner", "partner");
  await seedFixtureFriendship(db, "owner", "other");
  await seedFixtureFriendship(db, "other", "partner");
  tripId = (await seedFixtureTrip(db, { userId: "owner", name: "Bishop", ...BISHOP })).id;
  otherTripId = (await seedFixtureTrip(db, { userId: "owner", name: "Squamish", ...BISHOP })).id;
});

it.each(["pending", "wrong friendship", "the owner themself"])(
  "rejects %s as a companion and rolls back earlier batch writes",
  async (reason) => {
    if (reason === "pending") await db.update(friendships).set({ status: "pending" });
    const insert =
      reason === "wrong friendship"
        ? env.DB.prepare(
            `INSERT INTO trip_companions
              (trip_id, user_id, friendship_user_id, friendship_friend_id)
             VALUES (?, 'partner', 'other', 'partner')`,
          ).bind(tripId)
        : reason === "the owner themself"
          ? env.DB.prepare(
              `INSERT INTO trip_companions
                (trip_id, user_id, friendship_user_id, friendship_friend_id)
               VALUES (?, 'owner', 'other', 'owner')`,
            ).bind(tripId)
          : insertCompanion();

    await expect(
      env.DB.batch([
        env.DB.prepare("UPDATE trips SET name = 'Changed' WHERE id = ?").bind(tripId),
        insert,
      ]),
    ).rejects.toThrow("trip companion: unavailable friend");
    expect(await db.select().from(tripCompanions)).toEqual([]);
    expect(
      await env.DB.prepare("SELECT name FROM trips WHERE id = ?").bind(tripId).first(),
    ).toEqual({ name: "Bishop" });
  },
);

it("tags a private friend and treats re-sending an unchanged tag as a no-op", async () => {
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "partner"));
  await insertCompanion().run();
  const before = await db.select().from(tripCompanions);
  expect(before).toMatchObject([{ tripId, userId: "partner", suppressed: false }]);

  await insertCompanion().run();
  expect(await db.select().from(tripCompanions)).toEqual(before);
});

it("rejects reinserting a removed companion even when conflicts would be ignored", async () => {
  await insertCompanion().run();
  await db.update(tripCompanions).set({ suppressed: true });
  const before = await db.select().from(tripCompanions);
  expect(before).toMatchObject([{ tripId, userId: "partner", suppressed: true }]);

  await expect(insertCompanion().run()).rejects.toThrow("trip companion: removed by companion");
  expect(await db.select().from(tripCompanions)).toEqual(before);
});

it("rejects inserting an already suppressed companion", async () => {
  await expect(insertCompanion("partner", 1).run()).rejects.toThrow(
    "trip companion: too many friends",
  );
  expect(await db.select().from(tripCompanions)).toEqual([]);
});

it("allows ten active companions, and frees a slot when one is suppressed", async () => {
  const ids = Array.from({ length: 11 }, (_, i) => `friend-${String(i).padStart(2, "0")}`);
  for (const id of ids) {
    await seedFixtureUser(db, { id });
    await seedFixtureFriendship(db, "owner", id);
  }
  for (const id of ids.slice(0, 10)) await insertCompanion(id).run();
  const before = await db.select().from(tripCompanions).orderBy(tripCompanions.userId);
  expect(before.map((row) => row.userId)).toEqual(ids.slice(0, 10));

  await insertCompanion(ids[0]).run();
  await expect(insertCompanion(ids[10]).run()).rejects.toThrow("trip companion: too many friends");
  expect(await db.select().from(tripCompanions).orderBy(tripCompanions.userId)).toEqual(before);

  await db
    .update(tripCompanions)
    .set({ suppressed: true })
    .where(eq(tripCompanions.userId, ids[0]));
  await insertCompanion(ids[10]).run();
  const after = await db.select().from(tripCompanions).orderBy(tripCompanions.userId);
  expect(after.map((row) => row.userId)).toEqual(ids);
  expect(after.filter((row) => !row.suppressed).map((row) => row.userId)).toEqual(ids.slice(1));
});

it.each([
  { tripId: "another trip" },
  { userId: "other" },
  { friendshipUserId: "other" },
  { friendshipFriendId: "other" },
  { suppressed: false },
])("rejects changing companion identity or undoing suppression: %j", async (change) => {
  await insertCompanion().run();
  await db.update(tripCompanions).set({ suppressed: true });
  const before = await db.select().from(tripCompanions);
  expect(before).toMatchObject([{ tripId, userId: "partner", suppressed: true }]);

  const changes = "tripId" in change ? { tripId: otherTripId } : change;
  // Raw D1 execution exposes the trigger error instead of Drizzle's query wrapper.
  const query = db.update(tripCompanions).set(changes).toSQL();
  await expect(
    env.DB.prepare(query.sql)
      .bind(...query.params)
      .run(),
  ).rejects.toThrow("trip companion: invalid update");
  expect(await db.select().from(tripCompanions)).toEqual(before);
});

it("rejects moving a tagged trip to another user", async () => {
  await insertCompanion().run();

  await expect(
    env.DB.prepare("UPDATE trips SET user_id = 'other' WHERE id = ?").bind(tripId).run(),
  ).rejects.toThrow("trip companion: trip owner cannot change");
});

it("deletes the tag with the friendship and with the trip", async () => {
  await insertCompanion().run();
  await insertCompanion("other").run();
  expect(await db.select().from(tripCompanions)).toHaveLength(2);

  const pair = friendshipPair("owner", "partner");
  await db.run(
    sql`DELETE FROM friendships WHERE user_id = ${pair.userId} AND friend_id = ${pair.friendId}`,
  );
  expect((await db.select().from(tripCompanions)).map((row) => row.userId)).toEqual(["other"]);

  await db.run(sql`DELETE FROM trips WHERE id = ${tripId}`);
  expect(await db.select().from(tripCompanions)).toEqual([]);
});
