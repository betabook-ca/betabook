import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { friendships, journalCompanions, user } from "@/db/schema";
import { friendshipPair } from "@/lib/friendships";
import {
  seedFixtureFriendship,
  seedFixtureJournalEntry,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const db = createDb(env.DB);
const ENTRY_ID = 7000;

function insertCompanion(userId = "partner", suppressed = 0) {
  const pair = friendshipPair("author", userId);
  return env.DB.prepare(
    `INSERT INTO journal_companions
      (entry_id, user_id, friendship_user_id, friendship_friend_id, suppressed)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (entry_id, user_id) DO NOTHING`,
  ).bind(ENTRY_ID, userId, pair.userId, pair.friendId, suppressed);
}

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  for (const id of ["author", "other", "partner"]) await seedFixtureUser(db, { id });
  await seedFixtureFriendship(db, "author", "partner");
  await seedFixtureFriendship(db, "author", "other");
  await seedFixtureFriendship(db, "other", "partner");
  for (const id of [ENTRY_ID, ENTRY_ID + 1]) {
    await seedFixtureJournalEntry(db, { id, userId: "author", entryDate: "2026-09-01" });
  }
});

it.each(["pending", "wrong friendship"])(
  "rejects a %s companion and rolls back earlier batch writes",
  async (reason) => {
    if (reason === "pending") {
      await db.update(friendships).set({ status: "pending" });
    }
    const insert =
      reason === "wrong friendship"
        ? env.DB.prepare(
            `INSERT INTO journal_companions
              (entry_id, user_id, friendship_user_id, friendship_friend_id)
             VALUES (?, 'partner', 'other', 'partner')`,
          ).bind(ENTRY_ID)
        : insertCompanion();
    await expect(
      env.DB.batch([
        env.DB.prepare("UPDATE journal_entries SET body = 'Changed' WHERE id = ?").bind(ENTRY_ID),
        insert,
      ]),
    ).rejects.toThrow("journal companion: unavailable friend");
    expect(await db.select().from(journalCompanions)).toEqual([]);
    expect(
      await env.DB.prepare("SELECT body FROM journal_entries WHERE id = ?").bind(ENTRY_ID).first(),
    ).toEqual({ body: null });
  },
);

it("tags a private friend and takes the re-send of an unchanged tag as a no-op", async () => {
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "partner"));
  await insertCompanion().run();
  const before = await db.select().from(journalCompanions);
  expect(before).toMatchObject([{ entryId: ENTRY_ID, userId: "partner", suppressed: false }]);
  // Re-saving an entry re-sends its unchanged tags, and BEFORE INSERT runs even
  // where ON CONFLICT DO NOTHING makes the row a no-op.
  await insertCompanion().run();
  expect(await db.select().from(journalCompanions)).toEqual(before);
});

it("rejects reinserting a removed companion even when conflicts would be ignored", async () => {
  await insertCompanion().run();
  await db.update(journalCompanions).set({ suppressed: true });
  const before = await db.select().from(journalCompanions);
  expect(before).toMatchObject([{ entryId: ENTRY_ID, userId: "partner", suppressed: true }]);
  await expect(insertCompanion().run()).rejects.toThrow("journal companion: removed by companion");
  expect(await db.select().from(journalCompanions)).toEqual(before);
});

it("rejects inserting an already suppressed companion", async () => {
  await expect(insertCompanion("partner", 1).run()).rejects.toThrow(
    "journal companion: too many friends",
  );
  expect(await db.select().from(journalCompanions)).toEqual([]);
});

it("allows ten active companions and existing tags at the cap, with suppression freeing a place", async () => {
  const ids = Array.from({ length: 11 }, (_, i) => `friend-${String(i).padStart(2, "0")}`);
  for (const id of ids) {
    await seedFixtureUser(db, { id });
    await seedFixtureFriendship(db, "author", id);
  }
  for (const id of ids.slice(0, 10)) await insertCompanion(id).run();
  const before = await db.select().from(journalCompanions).orderBy(journalCompanions.userId);
  expect(before.map((row) => row.userId)).toEqual(ids.slice(0, 10));
  await insertCompanion(ids[0]).run();
  await expect(insertCompanion(ids[10]).run()).rejects.toThrow(
    "journal companion: too many friends",
  );
  expect(await db.select().from(journalCompanions).orderBy(journalCompanions.userId)).toEqual(
    before,
  );
  await db
    .update(journalCompanions)
    .set({ suppressed: true })
    .where(eq(journalCompanions.userId, ids[0]));
  await insertCompanion(ids[10]).run();
  const after = await db.select().from(journalCompanions).orderBy(journalCompanions.userId);
  expect(after.map((row) => row.userId)).toEqual(ids);
  expect(after.filter((row) => !row.suppressed).map((row) => row.userId)).toEqual(ids.slice(1));
});

it.each([
  { entryId: ENTRY_ID + 1 },
  { userId: "other" },
  { friendshipUserId: "other" },
  { friendshipFriendId: "other" },
  { suppressed: false },
])("rejects changing companion identity or undoing suppression: %j", async (changes) => {
  await insertCompanion().run();
  await db.update(journalCompanions).set({ suppressed: true });
  const before = await db.select().from(journalCompanions);
  expect(before).toMatchObject([{ entryId: ENTRY_ID, userId: "partner", suppressed: true }]);
  // Raw D1 execution exposes the trigger error instead of Drizzle's query wrapper.
  const query = db.update(journalCompanions).set(changes).toSQL();
  await expect(
    env.DB.prepare(query.sql)
      .bind(...query.params)
      .run(),
  ).rejects.toThrow("journal companion: invalid update");
  expect(await db.select().from(journalCompanions)).toEqual(before);
});
