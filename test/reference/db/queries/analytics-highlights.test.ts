import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { journalCompanions, journalEntries, user } from "@/db/schema";
import { friendshipPair } from "@/lib/friendships";
import { seedFixtureFriendship, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getAnalyticsHighlightSessions } from "./analytics-highlights";
const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "owner", journalVisibility: "public" });
  await seedFixtureUser(db, { id: "partner", journalVisibility: "public" });
  await seedFixtureUser(db, { id: "viewer", journalVisibility: "public" });
  await seedFixtureFriendship(db, "owner", "partner");
  await db.insert(journalEntries).values({
    id: 99,
    userId: "owner",
    kind: "session",
    climbId: 1,
    entryDate: "2025-01-06",
    tags: ["project"],
  });
  const pair = friendshipPair("owner", "partner");
  await db.insert(journalCompanions).values({
    entryId: 99,
    userId: "partner",
    friendshipUserId: pair.userId,
    friendshipFriendId: pair.friendId,
  });
});
it("reads matching sessions with visible companions and respects fresh audience changes", async () => {
  expect(await getAnalyticsHighlightSessions(db, "owner", null, ["project"])).toEqual([]);
  const rows = await getAnalyticsHighlightSessions(db, "owner", "viewer", ["project"]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: 99,
    sent: false,
    isAscent: false,
    companions: [{ id: "partner" }],
  });
  expect(await getAnalyticsHighlightSessions(db, "owner", "viewer", ["missing"])).toEqual([]);
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "partner"));
  for (const reader of ["owner", "viewer"])
    expect(
      (await getAnalyticsHighlightSessions(db, "owner", reader, []))[0].companions,
    ).toMatchObject([{ id: "partner" }]);
  await db.update(user).set({ journalVisibility: "private" }).where(eq(user.id, "owner"));
  expect(await getAnalyticsHighlightSessions(db, "owner", "viewer", [])).toEqual([]);
  expect(
    (await getAnalyticsHighlightSessions(db, "owner", "owner", [])).map((row) => row.id),
  ).toEqual([99]);
});
