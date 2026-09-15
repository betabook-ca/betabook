import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { getFeedPage } from "@/db/queries/feed";
import { refreshGoalAchievements } from "@/db/queries/goals";
import { goalAchievements, goalCompletions, goals } from "@/db/schema";
import { seedFixtureFriendship, seedFixtureJournalEntry, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { refreshDirtyGoalOwners } from "./goal-refresh-worker";

const db = createDb(env.DB);
const now = new Date("2026-09-12T12:00:00Z");

beforeEach(async () => {
  await resetDb(db);
});

async function seedOwner(userId: string, legacy = false) {
  await seedFixtureUser(db, { id: userId });
  await seedFixtureJournalEntry(db, { userId, kind: "training", entryDate: "2026-09-10" });
  const [goal] = await db
    .insert(goals)
    .values({
      userId,
      kind: "training",
      target: 1,
      timeframe: "month",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      timezone: "UTC",
      celebrationsInitialized: !legacy,
    })
    .returning();
  return goal;
}

it("caps recovery at 20 distinct owners and leaves the remaining owners queued", async () => {
  for (let index = 0; index < 21; index += 1)
    await seedOwner(`owner-${String(index).padStart(2, "0")}`);
  expect(await refreshDirtyGoalOwners(db, now, 100)).toEqual({
    attempted: 20,
    refreshed: 20,
    failed: 0,
  });
  const dirty = await db.select().from(goals).where(eq(goals.progressDirty, true));
  expect(dirty).toMatchObject([{ userId: "owner-20", progressRefreshAttemptedAt: null }]);
  expect(await db.select().from(goalCompletions)).toHaveLength(20);
  expect(await refreshDirtyGoalOwners(db, new Date(now.valueOf() + 60_000))).toEqual({
    attempted: 1,
    refreshed: 1,
    failed: 0,
  });
  expect(await db.select().from(goals).where(eq(goals.progressDirty, true))).toEqual([]);
  expect(await db.select().from(goalCompletions)).toHaveLength(21);
});

it("persists failed attempts before refresh and gives unattempted owners their turn", async () => {
  const first = await seedOwner("a-failing");
  await seedOwner("b-ready");
  await db.run(sql`CREATE TRIGGER test_goal_recovery_failure BEFORE INSERT ON goal_progress
    WHEN NEW.goal_id IN (SELECT id FROM goals WHERE user_id='a-failing')
    BEGIN SELECT RAISE(ABORT, 'recovery unavailable'); END`);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await refreshDirtyGoalOwners(db, now, 1)).toEqual({
      attempted: 1,
      refreshed: 0,
      failed: 1,
    });
    expect(await db.select().from(goals).where(eq(goals.id, first.id)).get()).toMatchObject({
      progressDirty: true,
      progressRefreshAttemptedAt: now,
    });
    expect(await db.select().from(goalCompletions)).toEqual([]);
    expect(await refreshDirtyGoalOwners(db, new Date(now.valueOf() + 60_000), 1)).toEqual({
      attempted: 1,
      refreshed: 1,
      failed: 0,
    });
    expect(await db.select().from(goals).where(eq(goals.progressDirty, true))).toMatchObject([
      { userId: "a-failing" },
    ]);
  } finally {
    await db.run(sql`DROP TRIGGER test_goal_recovery_failure`);
    log.mockRestore();
  }
  expect(await refreshDirtyGoalOwners(db, new Date(now.valueOf() + 120_000), 1)).toEqual({
    attempted: 1,
    refreshed: 1,
    failed: 0,
  });
  expect(await db.select().from(goalCompletions)).toHaveLength(2);
});

it("refreshes every goal of one selected owner and silently baselines legacy achievements", async () => {
  const first = await seedOwner("owner", true);
  await db.insert(goals).values({
    ...first,
    id: undefined,
    tags: ["hangboard"],
  });
  expect(await refreshDirtyGoalOwners(db, now, 1)).toEqual({
    attempted: 1,
    refreshed: 1,
    failed: 0,
  });
  const ownerGoals = await db.select().from(goals);
  expect(ownerGoals).toHaveLength(2);
  expect(ownerGoals.map((goal) => goal.progressDirty)).toEqual([false, false]);
  expect(await db.select().from(goalAchievements)).toMatchObject([
    { goalId: first.id, acknowledgedAt: now.toISOString() },
  ]);
  expect(await refreshDirtyGoalOwners(db, now)).toEqual({ attempted: 0, refreshed: 0, failed: 0 });
});

it("publishes a due completion at the goal's midnight without another owner action", async () => {
  const first = await seedOwner("owner");
  await db
    .update(goals)
    .set({ timezone: "America/Los_Angeles", target: 2 })
    .where(eq(goals.id, first.id));
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-12" });
  const beforeMidnight = new Date("2026-09-12T06:59:59Z");
  await refreshGoalAchievements(db, "owner", beforeMidnight);
  expect(await db.select().from(goals).get()).toMatchObject({
    progressDirty: false,
    progressRefreshDate: "2026-09-12",
  });
  expect(await db.select().from(goalCompletions)).toEqual([]);
  expect(await refreshDirtyGoalOwners(db, beforeMidnight)).toEqual({
    attempted: 0,
    refreshed: 0,
    failed: 0,
  });
  expect(await refreshDirtyGoalOwners(db, new Date("2026-09-12T07:00:00Z"))).toEqual({
    attempted: 1,
    refreshed: 1,
    failed: 0,
  });
  expect(await db.select().from(goalCompletions)).toMatchObject([
    { goalId: first.id, completedDate: "2026-09-12" },
  ]);
});

it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects an invalid owner limit %s",
  async (limit) => {
    await expect(refreshDirtyGoalOwners(db, now, limit)).rejects.toThrow("positive integer");
  },
);

it("publishes a future log in the next monthly period to friends without an owner visit", async () => {
  await seedFixtureUser(db, { id: "owner", journalVisibility: "friends" });
  await seedFixtureUser(db, { id: "friend" });
  await seedFixtureFriendship(db, "owner", "friend");
  const [routine] = await db
    .insert(goals)
    .values({
      userId: "owner",
      kind: "training",
      target: 1,
      timeframe: "month",
      repeat: "month",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      timezone: "UTC",
      celebrationsInitialized: true,
    })
    .returning();
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    kind: "training",
    entryDate: "2026-10-01",
  });
  await refreshGoalAchievements(db, "owner", new Date("2026-09-30T23:59:00Z"));
  expect(await db.select().from(goals).where(eq(goals.id, routine.id)).get()).toMatchObject({
    progressDirty: false,
    progressRefreshDate: "2026-10-01",
  });
  expect(await db.select().from(goalCompletions)).toEqual([]);
  const before = await getFeedPage(db, "friend");
  expect(before.days).toMatchObject([{ userId: "owner", date: "2026-10-01", goals: 0 }]);

  expect(await refreshDirtyGoalOwners(db, new Date("2026-10-01T00:00:00Z"))).toEqual({
    attempted: 1,
    refreshed: 1,
    failed: 0,
  });
  expect(await db.select().from(goalCompletions)).toMatchObject([
    { goalId: routine.id, periodStart: "2026-10-01", completedDate: "2026-10-01" },
  ]);
  const after = await getFeedPage(db, "friend");
  expect(after.days).toMatchObject([
    {
      userId: "owner",
      date: "2026-10-01",
      goals: 1,
      activities: expect.arrayContaining([
        expect.objectContaining({ kind: "goal", goalTitle: "Train 1 time every month" }),
      ]),
    },
  ]);
  expect((await db.select().from(goals).get())?.progressRefreshDate).toBeNull();
});
