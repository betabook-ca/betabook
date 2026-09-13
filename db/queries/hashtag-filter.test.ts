import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { parseJournalFilter, journalFilterToSearchParams } from "@/lib/filters/journal-filter";
import {
  DEFAULT_USER_SENDS_FILTER,
  parseUserSendsFilter,
  userSendsFilterToSearchParams,
} from "@/lib/filters/user-sends-filter";
import {
  seedFixtureTree,
  seedFixtureUser,
  seedFixtureSend,
  seedFixtureJournalEntry,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getUserHashtags } from "./hashtag-filter";
import { getJournalPage, getJournalSessionsForAnalytics } from "./journal";
import { getSendsForUserPage, getUserSendsForAnalytics } from "./sends";
const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "owner", name: "Owner" });
  for (const climbId of [1, 2]) {
    await seedFixtureSend(db, { userId: "owner", climbId, dateSent: "2025-01-01" });
    await seedFixtureJournalEntry(db, {
      userId: "owner",
      climbId,
      entryDate: "2025-01-01",
      sent: true,
      isAscent: true,
      tags: [climbId === 1 ? "trip" : "trip-long"],
    });
  }
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    climbId: 2,
    entryDate: "2025-01-02",
    sent: true,
    tags: ["trip"],
  });
});
it("filters sends by the exact ascent tag, excluding repeats and preserving pagination", async () => {
  const filter = { ...DEFAULT_USER_SENDS_FILTER, tags: ["trip"] };
  const page = await getSendsForUserPage(db, "owner", filter, 0, 1, "owner");
  expect(page.sends.map((row) => row.climbId)).toEqual([1]);
  expect(page.hasMore).toBe(false);
  expect((await getSendsForUserPage(db, "owner", filter, 1, 1, "owner")).sends).toEqual([]);
  expect(
    (await getSendsForUserPage(db, "owner", { ...filter, tags: ["missing"] }, 0, 10, "owner"))
      .sends,
  ).toEqual([]);
});
it("filters analytic sends and session counts consistently", async () => {
  expect(
    (await getUserSendsForAnalytics(db, "owner", "owner", ["trip"])).map((row) => row.climbId),
  ).toEqual([1]);
  expect(await getJournalSessionsForAnalytics(db, "owner", "owner", ["trip"])).toEqual([
    { entryDate: "2025-01-01", climbType: "boulder", count: 1 },
    { entryDate: "2025-01-02", climbType: "boulder", count: 1 },
  ]);
});
it("does not reveal private journal tags through send filtering", async () => {
  await db.run(sql`UPDATE user SET journal_visibility = 'private' WHERE id = 'owner'`);
  expect(
    (await getSendsForUserPage(db, "owner", { ...DEFAULT_USER_SENDS_FILTER, tags: ["trip"] }, 0))
      .sends,
  ).toEqual([]);
  expect(await getUserSendsForAnalytics(db, "owner", null, ["trip"])).toEqual([]);
  expect((await getUserSendsForAnalytics(db, "owner")).map((row) => row.climbId)).toEqual([1, 2]);
});
it("normalizes hashtag input and retains it in pagination URLs", () => {
  const parsed = parseUserSendsFilter({ tag: " #TRIP " });
  expect(parsed.tags).toEqual(["trip"]);
  expect(userSendsFilterToSearchParams(parsed).get("tag")).toBe("trip");
});

it("suggests only this user's visible tags and distinguishes ascents from sessions", async () => {
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    climbId: 1,
    entryDate: "2025-02-01",
    tags: ["session-only", "trip"],
  });
  await seedFixtureUser(db, { id: "other", name: "Other" });
  await seedFixtureJournalEntry(db, {
    userId: "other",
    climbId: 1,
    entryDate: "2025-02-01",
    tags: ["someone-else"],
  });
  expect(await getUserHashtags(db, "owner", "owner", true)).toEqual(["trip", "trip-long"]);
  expect(await getUserHashtags(db, "owner", "owner")).toEqual([
    "session-only",
    "trip",
    "trip-long",
  ]);
  await db.run(sql`UPDATE user SET journal_visibility = 'public' WHERE id = 'owner'`);
  expect(await getUserHashtags(db, "owner", "reader", true)).toEqual(["trip", "trip-long"]);
  await db.run(sql`UPDATE user SET journal_visibility = 'private' WHERE id = 'owner'`);
  expect(await getUserHashtags(db, "owner", null)).toEqual([]);
  expect(await getJournalSessionsForAnalytics(db, "owner", null, ["trip"])).toEqual([]);
});

it("matches every selected tag on the same ascent and round trips repeated URL params", async () => {
  await db.run(
    sql`UPDATE journal_entries SET tags = '["trip", "project"]' WHERE user_id = 'owner' AND climb_id = 1 AND is_ascent = 1`,
  );
  const filter = { ...DEFAULT_USER_SENDS_FILTER, tags: ["trip", "project"] };
  expect(
    (await getSendsForUserPage(db, "owner", filter, 0, 10, "owner")).sends.map(
      (row) => row.climbId,
    ),
  ).toEqual([1]);
  expect(
    (await getUserSendsForAnalytics(db, "owner", "owner", filter.tags)).map((row) => row.climbId),
  ).toEqual([1]);
  expect(await getJournalSessionsForAnalytics(db, "owner", "owner", filter.tags)).toEqual([
    { entryDate: "2025-01-01", climbType: "boulder", count: 1 },
  ]);
  const separateEntries = ["trip", "trip-long"];
  expect(await getUserSendsForAnalytics(db, "owner", "owner", separateEntries)).toEqual([]);
  expect(await getJournalSessionsForAnalytics(db, "owner", "owner", separateEntries)).toEqual([]);
  const parsed = parseUserSendsFilter({ tag: [" #TRIP ", "project", "trip", ""] });
  expect(parsed.tags).toEqual(["trip", "project"]);
  expect(userSendsFilterToSearchParams(parsed).getAll("tag")).toEqual(["trip", "project"]);
});

it("filters Journal by all selected tags on one entry, including training", async () => {
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    kind: "training",
    entryDate: "2025-03-01",
    tags: ["strength", "trip"],
  });
  const parsed = parseJournalFilter({ tag: ["trip", "strength"] });
  expect(journalFilterToSearchParams(parsed).getAll("tag")).toEqual(["trip", "strength"]);
  const page = await getJournalPage(db, "owner", "owner", parsed);
  expect(page.entries.map((entry) => entry.kind)).toEqual(["training"]);
  expect(page.entries[0].tags).toEqual(["strength", "trip"]);
  expect(
    (await getJournalPage(db, "owner", "owner", parseJournalFilter({ tag: ["trip", "trip-long"] })))
      .entries,
  ).toEqual([]);
});
