import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import {
  goals,
  goalAchievements,
  goalCompletions,
  goalProgress,
  journalEntries,
} from "@/db/schema";
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

it("invalidates a completed tagged goal on a tag-only edit and restores its stable event on repair", async () => {
  await db
    .insert(goals)
    .values({ ...definition, tags: ["hangboard"], celebrationsInitialized: true });
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    kind: "training",
    entryDate: "2026-09-02",
    tags: ["hangboard"],
  });
  await getGoalOverview(db, "owner", "owner", now);
  const [before] = await db.select().from(goalCompletions);
  expect(before.title).toBe("Train 1 time · #hangboard");
  await db.update(journalEntries).set({ tags: ["strength"] });
  expect((await db.select().from(goalCompletions))[0].completedDate).toBeNull();
  await db.update(journalEntries).set({ tags: ["hangboard"] });
  await getGoalOverview(db, "owner", "owner", now);
  expect(await db.select().from(goalCompletions)).toEqual([before]);
});

it("matches persisted feed titles to the goal UI for every goal kind and hashtag selection", async () => {
  const { goalCompletionTitleSql } = await import("./goals");
  const { goalTitle } = await import("@/lib/goals");
  const kinds = ["training", "volume", "grade", "days", "new-areas"] as const;
  for (const kind of kinds)
    for (const target of [1, 3])
      for (const repeat of ["none", "week"] as const) {
        const current = {
          kind,
          target,
          repeat,
          discipline: "boulder" as const,
          grade: 5,
          gradeMatch: "at-least" as const,
          tags: ["hangboard", "outdoor"],
        };
        const result = await db.get<{ title: string }>(
          sql`SELECT ${goalCompletionTitleSql()} AS title FROM (SELECT ${kind} AS kind,CAST(${target} AS INTEGER) AS target,${repeat} AS repeat,'boulder' AS discipline,5 AS grade,'at-least' AS gradeMatch,${JSON.stringify(current.tags)} AS tags) current`,
        );
        expect(result?.title).toBe(goalTitle(current));
      }
});

it("keeps legacy achievements baselined when another log invalidates the projection after refresh", async () => {
  await db.insert(goals).values({ ...definition, tags: ["hangboard"] });
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    kind: "training",
    entryDate: "2026-09-02",
    tags: ["hangboard"],
  });
  const originalBatch = db.batch.bind(db);
  let invalidate = true;
  const spy = vi.spyOn(db, "batch").mockImplementation(async (...args) => {
    const result = await originalBatch(...args);
    if (invalidate) {
      invalidate = false;
      await seedFixtureJournalEntry(db, {
        userId: "owner",
        kind: "training",
        entryDate: "2026-09-03",
        tags: ["mobility"],
      });
    }
    return result;
  });
  try {
    expect((await getGoalOverview(db, "owner", "owner", now)).completed.celebrations).toEqual([]);
    expect((await getGoalOverview(db, "owner", "owner", now)).completed.celebrations).toEqual([]);
    const records = await db.select().from(goalAchievements);
    expect(records).toHaveLength(1);
    expect(records[0].acknowledgedAt).not.toBeNull();
  } finally {
    spy.mockRestore();
  }
});

it("reuses validated period progress on unchanged owner reads without scanning journal history", async () => {
  await db.insert(goals).values({ ...definition, celebrationsInitialized: true });
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  const first = await getGoalOverview(db, "owner", "owner", now);
  const { explainQueries } = await import("@/test/query-plans");
  const plans = await explainQueries(db, async () => {
    expect(await getGoalOverview(db, "owner", "owner", now)).toEqual(first);
  });
  expect(
    plans
      .flat()
      .map((row) => row.detail)
      .join("\n"),
  ).not.toMatch(/journal_entries|journal_user_/);
});

it("adds a recurring period at rollover without recalculating clean historical results", async () => {
  await db.insert(goals).values({
    ...definition,
    timeframe: "week",
    repeat: "week",
    startDate: "2026-09-07",
    endDate: "2026-09-13",
    celebrationsInitialized: true,
  });
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-08" });
  await getGoalOverview(db, "owner", "owner", now);
  const next = await getGoalOverview(db, "owner", "owner", new Date("2026-09-14T12:00:00Z"));
  expect(next.active.goals[0]).toMatchObject({ periodStart: "2026-09-14", progress: 0 });
  expect(await db.select().from(goalProgress)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        periodStart: "2026-09-07",
        progress: 1,
        completedDate: "2026-09-08",
      }),
      expect.objectContaining({ periodStart: "2026-09-14", progress: 0, completedDate: null }),
    ]),
  );
});

it("does not let an older civil-date read revoke a newer completion", async () => {
  await db.insert(goals).values({ ...definition, celebrationsInitialized: true });
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-13" });
  await getGoalOverview(db, "owner", "owner", new Date("2026-09-13T12:00:00Z"));
  await getGoalOverview(db, "owner", "owner", now);
  expect(await db.select().from(goalCompletions)).toMatchObject([{ completedDate: "2026-09-13" }]);
  expect((await db.select().from(goals))[0].progressDates).toEqual({ UTC: "2026-09-13" });
});

it("keeps failed refreshes dirty and repairs them on the next owner read", async () => {
  await db.insert(goals).values({ ...definition, celebrationsInitialized: true });
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  await db.run(
    sql`CREATE TRIGGER test_progress_failure BEFORE INSERT ON goal_completions BEGIN SELECT RAISE(ABORT, 'progress refresh failed'); END`,
  );
  const { refreshGoalAchievements } = await import("./goals");
  try {
    await expect(refreshGoalAchievements(db, "owner", now)).rejects.toThrow(
      /progress refresh failed/,
    );
    expect(await db.select().from(goalProgress)).toEqual([]);
    expect((await db.select().from(goals))[0]).toMatchObject({
      progressDirty: true,
      progressDates: null,
    });
  } finally {
    await db.run(sql`DROP TRIGGER test_progress_failure`);
  }
  expect((await getGoalOverview(db, "owner", "owner", now)).completed.celebrations).toHaveLength(1);
  expect((await db.select().from(goals))[0].progressDirty).toBe(false);
});

it("rechecks dirty state when a log is added between metadata and cached counts", async () => {
  await db.insert(goals).values({ ...definition, target: 2, celebrationsInitialized: true });
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  await getGoalOverview(db, "owner", "owner", now);
  const original = db.all.bind(db);
  let mutate = true;
  const spy = vi.spyOn(db, "all").mockImplementation((query) => {
    const result = original(query);
    const execute = result.execute.bind(result);
    vi.spyOn(result, "execute").mockImplementation(async () => {
      const rows = await execute();
      if (
        mutate &&
        rows.some(
          (row) => typeof row === "object" && row !== null && "timezone" in row && !("id" in row),
        )
      ) {
        mutate = false;
        await seedFixtureJournalEntry(db, {
          userId: "owner",
          kind: "training",
          entryDate: "2026-09-03",
        });
      }
      return rows;
    });
    return result;
  });
  try {
    const page = await getGoalOverview(db, "owner", "owner", now);
    expect(page.active.goals[0]).toMatchObject({ progress: 2, completedDate: "2026-09-03" });
    expect(page.completed.celebrations).toHaveLength(1);
  } finally {
    spy.mockRestore();
  }
});

it("retries an active goal whose timezone crosses a month boundary after metadata is read", async () => {
  const boundary = new Date("2026-08-31T12:30:00Z");
  await db.insert(goals).values({
    ...definition,
    repeat: "month",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    celebrationsInitialized: true,
  });
  await getGoalOverview(db, "owner", "owner", boundary);
  const original = db.all.bind(db);
  let mutate = true;
  const spy = vi.spyOn(db, "all").mockImplementation((query) => {
    const result = original(query);
    const execute = result.execute.bind(result);
    vi.spyOn(result, "execute").mockImplementation(async () => {
      const rows = await execute();
      if (
        mutate &&
        rows.some(
          (row) => typeof row === "object" && row !== null && "timezone" in row && !("id" in row),
        )
      ) {
        mutate = false;
        await db
          .update(goals)
          .set({ timezone: "Pacific/Kiritimati", startDate: "2026-09-01", endDate: "2026-09-30" });
      }
      return rows;
    });
    return result;
  });
  try {
    const { getGoalPage } = await import("./goals");
    const page = await getGoalPage(db, "owner", "owner", "active", 0, boundary);
    expect(page.goals).toMatchObject([
      { timezone: "Pacific/Kiritimati", periodStart: "2026-09-01", progress: 0 },
    ]);
  } finally {
    spy.mockRestore();
  }
});
