import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import {
  climbs,
  goals,
  goalCompletions,
  goalPeriods,
  goalProgress,
  journalEntries,
} from "@/db/schema";
import { seedFixtureJournalEntry, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const db = createDb(env.DB);
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
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "owner" });
  await seedFixtureUser(db, { id: "other" });
});

async function markClean() {
  const rows = await db.select().from(goals);
  await db.update(goals).set({ progressDirty: false, progressDates: { UTC: "2026-09-15" } });
  for (const goal of rows) {
    await db
      .insert(goalCompletions)
      .values({
        goalId: goal.id,
        periodStart: goal.startDate,
        repeat: goal.repeat,
        completedDate: goal.startDate,
        title: "Saved completion",
      })
      .onConflictDoUpdate({
        target: [goalCompletions.goalId, goalCompletions.periodStart, goalCompletions.repeat],
        set: { completedDate: goal.startDate },
      });
  }
}

async function dirtyIds() {
  return (await db.select().from(goals).where(eq(goals.progressDirty, true)))
    .map((goal) => goal.id)
    .sort((a, b) => a - b);
}

it("starts progress dirty and cascades cached periods when their goal is deleted", async () => {
  const [goal] = await db.insert(goals).values(definition).returning();
  expect(goal).toMatchObject({ progressDirty: true, progressDates: null });
  await db.insert(goalProgress).values({
    goalId: goal.id,
    periodStart: goal.startDate,
    repeat: goal.repeat,
    periodEnd: goal.endDate,
    progress: 0,
  });
  expect(await db.select().from(goalProgress)).toMatchObject([
    { goalId: goal.id, progress: 0, completedDate: null },
  ]);
  await db.delete(goals).where(eq(goals.id, goal.id));
  expect(await db.select().from(goalProgress)).toEqual([]);
});

it.each([
  ["2026-07-15", [4, 5, 6]],
  ["2026-09-15", [2, 3, 4, 5, 6]],
  ["2027-01-15", [3]],
] as const)(
  "invalidates only potentially affected goal windows for a log on %s",
  async (entryDate, expected) => {
    await db.insert(goals).values([
      { ...definition, id: 1, startDate: "2026-01-01", endDate: "2026-01-31", archiveToken: "old" },
      { ...definition, id: 2 },
      { ...definition, id: 3, repeat: "month" },
      { ...definition, id: 4 },
      { ...definition, id: 5, kind: "new-areas" },
      { ...definition, id: 6 },
      { ...definition, id: 7, userId: "other" },
    ]);
    await db.insert(goalPeriods).values([
      {
        goalId: 4,
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        target: 1,
        repeat: "month",
        timezone: "UTC",
        kind: "training",
        gradeMatch: "exact",
      },
      {
        goalId: 6,
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        target: 1,
        repeat: "month",
        timezone: "UTC",
        kind: "new-areas",
        gradeMatch: "exact",
      },
    ]);
    await markClean();
    await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate });
    expect(await dirtyIds()).toEqual(expected);
    const completions = await db.select().from(goalCompletions);
    expect(completions).toHaveLength(7);
    expect(completions.every((row) => row.completedDate !== null)).toBe(true);
  },
);

it("invalidates both original and replacement dates, then the deleted entry's date", async () => {
  await seedFixtureJournalEntry(db, {
    id: 1,
    userId: "owner",
    kind: "training",
    entryDate: "2026-08-15",
  });
  await db.insert(goals).values([
    { ...definition, id: 1, startDate: "2026-08-01", endDate: "2026-08-31" },
    { ...definition, id: 2 },
  ]);
  await markClean();
  await db.update(journalEntries).set({ entryDate: "2026-09-15" }).where(eq(journalEntries.id, 1));
  expect(await dirtyIds()).toEqual([1, 2]);
  await markClean();
  await db.delete(journalEntries).where(eq(journalEntries.id, 1));
  expect(await dirtyIds()).toEqual([2]);
});

it("invalidates tag-only corrections without rewriting completion rows", async () => {
  await seedFixtureJournalEntry(db, {
    id: 1,
    userId: "owner",
    kind: "training",
    entryDate: "2026-09-15",
    tags: ["hangboard"],
  });
  await db.insert(goals).values({ ...definition, id: 1, tags: ["hangboard"] });
  await markClean();
  await db
    .update(journalEntries)
    .set({ tags: ["mobility"] })
    .where(eq(journalEntries.id, 1));
  expect(await dirtyIds()).toEqual([1]);
  expect((await db.select().from(goalCompletions))[0].completedDate).toBe("2026-09-01");
  await db.run(sql`CREATE TRIGGER test_repeated_goal_invalidation BEFORE UPDATE ON goal_completions
    BEGIN SELECT RAISE(ABORT, 'completion rows must not be rewritten'); END`);
  try {
    await db
      .update(journalEntries)
      .set({ tags: ["hangboard"] })
      .where(eq(journalEntries.id, 1));
    expect(await dirtyIds()).toEqual([1]);
  } finally {
    await db.run(sql`DROP TRIGGER test_repeated_goal_invalidation`);
  }
});

it("ignores projection metadata and archiving but invalidates definition and snapshot changes", async () => {
  await db.insert(goals).values({ ...definition, id: 1 });
  await markClean();
  await db.update(goals).set({ progressDates: { UTC: "2026-09-16" }, archiveToken: "archived" });
  expect(await dirtyIds()).toEqual([]);
  expect((await db.select().from(goalCompletions))[0].completedDate).toBe("2026-09-01");
  await db.update(goals).set({ target: 2 });
  expect(await dirtyIds()).toEqual([1]);
  await markClean();
  await db.insert(goalPeriods).values({
    goalId: 1,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    target: 1,
    repeat: "month",
    timezone: "UTC",
    kind: "training",
    gradeMatch: "exact",
  });
  expect(await dirtyIds()).toEqual([1]);
  await markClean();
  await db.update(goalPeriods).set({ tags: ["hangboard"] });
  expect(await dirtyIds()).toEqual([1]);
  await markClean();
  await db.delete(goalPeriods);
  expect(await dirtyIds()).toEqual([1]);
});

it("invalidates all affected climbers' goals after a relevant climb edit", async () => {
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    kind: "session",
    climbId: 1,
    entryDate: "2026-01-15",
  });
  await db.insert(goals).values([
    { ...definition, id: 1 },
    { ...definition, id: 2, userId: "other" },
  ]);
  await markClean();
  await db.update(climbs).set({ grade: 6 }).where(eq(climbs.id, 1));
  expect(await dirtyIds()).toEqual([1]);
  expect(await db.select().from(goalCompletions)).toMatchObject([
    { goalId: 1, completedDate: "2026-09-01" },
    { goalId: 2, completedDate: "2026-09-01" },
  ]);
});
