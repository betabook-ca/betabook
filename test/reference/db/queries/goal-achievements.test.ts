import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { goals, goalAchievements, goalCompletions, journalEntries } from "@/db/schema";
import { seedFixtureUser, seedFixtureJournalEntry } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getGoalOverview, refreshGoalAchievements } from "./goals";

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
  await refreshGoalAchievements(db, "owner", now);
  const rows = await db.select().from(goalAchievements);
  expect(rows).toHaveLength(1);
  expect(rows[0].acknowledgedAt).not.toBeNull();
});

it("detects a backdated achievement on the next visit and retains acknowledgement after delete/relog", async () => {
  await db.insert(goals).values({ ...definition, celebrationsInitialized: true });
  await getGoalOverview(db, "owner", "owner", new Date("2026-09-10T12:00:00Z"));
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  await refreshGoalAchievements(db, "owner", now);
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
  await refreshGoalAchievements(db, "owner", now);
  expect((await getGoalOverview(db, "owner", "owner", now)).completed.celebrations).toHaveLength(1);
});

it("returns every unread achievement independently of history pagination", async () => {
  await db
    .insert(goals)
    .values(Array.from({ length: 7 }, () => ({ ...definition, celebrationsInitialized: true })));
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  await refreshGoalAchievements(db, "owner", now);
  const overview = await getGoalOverview(db, "owner", "owner", now);
  expect(overview.completed.goals).toHaveLength(5);
  expect(overview.completed.celebrations).toHaveLength(7);
});

it("does not create or return a phantom achievement from an older read after its log is deleted", async () => {
  await db.insert(goals).values({ ...definition, celebrationsInitialized: true });
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  const { refreshGoalAchievements } = await import("./goals");
  expect(await db.select().from(goalAchievements)).toEqual([]);
  const originalAll = db.all.bind(db);
  let release!: () => void;
  let ready!: () => void;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reading = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let intercept = true;
  const spy = vi.spyOn(db, "all").mockImplementation((query) => {
    const result = originalAll(query);
    const execute = result.execute.bind(result);
    vi.spyOn(result, "execute").mockImplementation(async () => {
      const rows = await execute();
      if (
        intercept &&
        rows.some((row) => typeof row === "object" && row !== null && "completedDate" in row)
      ) {
        intercept = false;
        ready();
        await paused;
      }
      return rows;
    });
    return result;
  });
  const olderRead = getGoalOverview(db, "owner", "owner", now);
  try {
    await reading;
    await db.delete(journalEntries).where(eq(journalEntries.userId, "owner"));
    await refreshGoalAchievements(db, "owner", now);
    release();
    const result = await olderRead;
    expect(result.completed.celebrations).toEqual([]);
    expect(await db.select().from(goalAchievements)).toEqual([]);
    expect(
      await db.all(sql`SELECT * FROM goal_completions WHERE completed_date IS NOT NULL`),
    ).toEqual([]);
  } finally {
    release();
    spy.mockRestore();
  }
});

it("ends a recurring routine inclusively and keeps bounded history years later", async () => {
  const { getRecurringGoalHistory } = await import("./goals");
  const [goal] = await db
    .insert(goals)
    .values({ ...definition, repeat: "month", recurringEndDate: "2026-09-12", target: 2 })
    .returning();
  for (const entryDate of ["2026-09-11", "2026-09-12", "2026-09-13", "2026-10-01"]) {
    await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate });
  }
  const active = await getGoalOverview(db, "owner", "owner", now);
  expect(active.active.goals[0]).toMatchObject({
    progress: 2,
    periodEnd: "2026-09-12",
    recurringEndDate: "2026-09-12",
  });
  await refreshGoalAchievements(db, "owner", now);
  const event = (await db.select().from(goalCompletions))[0];
  const later = new Date("2029-04-10T12:00:00Z");
  const overview = await getGoalOverview(db, "owner", "owner", later);
  expect(overview.active.goals).toEqual([]);
  expect(overview.completed.goals[0]).toMatchObject({ id: goal.id, repeat: "month", progress: 2 });
  const history = await getRecurringGoalHistory(db, "owner", "owner", goal.id, 0, later);
  expect(history.anchorMonth).toBe("2026-09");
  expect(history.periods).toHaveLength(1);
  expect(history.periods[0].periodEnd).toBe("2026-09-12");
  expect(await db.select().from(goalCompletions)).toMatchObject([
    { id: event.id, completedDate: "2026-09-12" },
  ]);
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2029-04-11" });
  expect((await getGoalOverview(db, "owner", "owner", later)).completed.goals[0].progress).toBe(2);
});

it("anchors stopped weekly history before a month boundary even during its original full week", async () => {
  const { getRecurringGoalHistory } = await import("./goals");
  const [goal] = await db
    .insert(goals)
    .values({
      ...definition,
      repeat: "week",
      timeframe: "week",
      startDate: "2026-08-31",
      endDate: "2026-09-06",
      recurringEndDate: "2026-08-31",
    })
    .returning();
  const history = await getRecurringGoalHistory(
    db,
    "owner",
    "owner",
    goal.id,
    0,
    new Date("2026-09-01T12:00:00Z"),
  );
  expect(history.anchorMonth).toBe("2026-08");
  expect(history.periods).toHaveLength(1);
  expect(history.periods[0].periodEnd).toBe("2026-08-31");
});

it("retains last-reconciled events on failed refresh and rechecks notices against live counts", async () => {
  await db.insert(goals).values({ ...definition, celebrationsInitialized: true });
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  await refreshGoalAchievements(db, "owner", now);
  const before = await db.select().from(goalCompletions);
  await db.delete(journalEntries).where(eq(journalEntries.userId, "owner"));
  const batch = vi.spyOn(db, "batch").mockRejectedValue(new Error("refresh unavailable"));
  try {
    await expect(refreshGoalAchievements(db, "owner", now)).rejects.toThrow("refresh unavailable");
    const page = await getGoalOverview(db, "owner", "owner", now);
    expect(page.active.goals[0].progress).toBe(0);
    expect(page.completed.celebrations).toEqual([]);
    expect(await db.select().from(goalCompletions)).toEqual(before);
  } finally {
    batch.mockRestore();
  }
  await refreshGoalAchievements(db, "owner", now);
  expect(await db.select().from(goalCompletions)).toEqual([]);
});

it("publishes future-dated completions only on a later owner reconciliation", async () => {
  await db.insert(goals).values({ ...definition, celebrationsInitialized: true });
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-13" });
  await refreshGoalAchievements(db, "owner", now);
  expect(await db.select().from(goalCompletions)).toEqual([]);
  await refreshGoalAchievements(db, "owner", new Date("2026-09-13T12:00:00Z"));
  expect(await db.select().from(goalCompletions)).toMatchObject([{ completedDate: "2026-09-13" }]);
});

it("rolls back events and achievement initialization together on failure", async () => {
  await db.insert(goals).values(definition);
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  await db.run(
    sql`CREATE TRIGGER test_achievement_failure BEFORE INSERT ON goal_achievements BEGIN SELECT RAISE(ABORT, 'achievement failure'); END`,
  );
  try {
    await expect(refreshGoalAchievements(db, "owner", now)).rejects.toThrow(/achievement failure/);
    expect(await db.select().from(goalCompletions)).toEqual([]);
    expect((await db.select().from(goals))[0].celebrationsInitialized).toBe(false);
  } finally {
    await db.run(sql`DROP TRIGGER test_achievement_failure`);
  }
});

it("defers legacy initialization when a timezone changes during reconciliation", async () => {
  await db.insert(goals).values(definition);
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  const original = db.all.bind(db);
  const spy = vi.spyOn(db, "all").mockImplementationOnce((query) => {
    const result = original(query);
    const execute = result.execute.bind(result);
    vi.spyOn(result, "execute").mockImplementationOnce(async () => {
      const rows = await execute();
      await db.update(goals).set({ timezone: "Pacific/Kiritimati" });
      return rows;
    });
    return result;
  });
  try {
    await refreshGoalAchievements(db, "owner", now);
    expect((await db.select().from(goals))[0].celebrationsInitialized).toBe(false);
  } finally {
    spy.mockRestore();
  }
  await refreshGoalAchievements(db, "owner", now);
  expect((await getGoalOverview(db, "owner", "owner", now)).completed.celebrations).toEqual([]);
  expect((await db.select().from(goalAchievements))[0].acknowledgedAt).not.toBeNull();
});
