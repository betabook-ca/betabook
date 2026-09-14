import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { goals, goalAchievements, journalEntries } from "@/db/schema";
import { seedFixtureUser, seedFixtureJournalEntry } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getGoalOverview } from "./goals";

const db = createDb(env.DB);
const now = new Date("2026-09-12T12:00:00Z");
const definition = {
  userId: "owner",
  kind: "training" as const,
  target: 1,
  timeframe: "month" as const,
  repeat: "none" as const,
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  timezone: "UTC",
};
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureUser(db, { id: "owner" });
  await seedFixtureUser(db, { id: "other" });
});

it("baselines old achievements without celebrating the existing history", async () => {
  await db.insert(goals).values(definition);
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  expect((await getGoalOverview(db, "owner", "owner", now)).completed.celebrations).toEqual([]);
  const rows = await db.select().from(goalAchievements);
  expect(rows).toHaveLength(1);
  expect(rows[0].acknowledgedAt).not.toBeNull();
});

it("detects a backdated achievement on the next visit and retains acknowledgement after delete/relog", async () => {
  await db.insert(goals).values({ ...definition, celebrationsInitialized: true });
  await getGoalOverview(db, "owner", "owner", new Date("2026-09-10T12:00:00Z"));
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  const detected = await getGoalOverview(db, "owner", "owner", now);
  expect(detected.completed.celebrations).toHaveLength(1);
  expect(detected.completed.celebrations?.[0].completedDate).toBe("2026-09-02");
  const tomorrow = new Date("2026-09-13T12:00:00Z");
  expect(
    (await getGoalOverview(db, "owner", "owner", tomorrow)).completed.celebrations,
  ).toHaveLength(1);
  await db.update(goalAchievements).set({ acknowledgedAt: now.toISOString() });
  await db.delete(journalEntries).where(eq(journalEntries.userId, "owner"));
  expect((await getGoalOverview(db, "owner", "owner", tomorrow)).completed.celebrations).toEqual(
    [],
  );
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  expect((await getGoalOverview(db, "owner", "owner", tomorrow)).completed.celebrations).toEqual(
    [],
  );
  expect(await db.select().from(goalAchievements)).toHaveLength(1);
});

it("does not let a visitor detect or initialize another owner's achievements", async () => {
  await db.insert(goals).values({ ...definition, celebrationsInitialized: true });
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-11" });
  await getGoalOverview(db, "owner", "other", now);
  expect(await db.select().from(goalAchievements)).toEqual([]);
  expect((await getGoalOverview(db, "owner", "owner", now)).completed.celebrations).toHaveLength(1);
});

it("returns every unread achievement independently of history pagination", async () => {
  await db
    .insert(goals)
    .values(Array.from({ length: 7 }, () => ({ ...definition, celebrationsInitialized: true })));
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  const overview = await getGoalOverview(db, "owner", "owner", now);
  expect(overview.completed.goals).toHaveLength(5);
  expect(overview.completed.celebrations).toHaveLength(7);
});
