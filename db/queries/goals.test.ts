import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { getGoalPage } from "@/db/queries/goals";
import { goals, journalEntries, user, friendships, climbs } from "@/db/schema";
import {
  seedFixtureTree,
  seedFixtureUser,
  seedFixtureJournalEntry,
  seedFixtureFriendship,
  seedFixtureSend,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const db = createDb(env.DB);
const now = new Date("2026-09-11T12:00:00Z");
const training = {
  userId: "owner",
  kind: "training" as const,
  target: 2,
  timeframe: "month" as const,
  repeat: "none" as const,
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  timezone: "UTC",
};
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "owner", journalVisibility: "friends" });
  await seedFixtureUser(db, { id: "friend" });
});
it("derives training progress and reverses completion after a deleted log", async () => {
  await db.insert(goals).values(training);
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  let page = await getGoalPage(db, "owner", "owner", "active", 0, now);
  expect(page.goals).toHaveLength(1);
  expect(page.goals[0].progress).toBe(1);
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-03" });
  expect((await getGoalPage(db, "owner", "owner", "active", 0, now)).goals).toHaveLength(0);
  expect((await getGoalPage(db, "owner", "owner", "completed", 0, now)).goals[0]).toMatchObject({
    progress: 2,
    completedDate: "2026-09-03",
  });
  await db.delete(journalEntries).where(eq(journalEntries.entryDate, "2026-09-03"));
  expect((await getGoalPage(db, "owner", "owner", "active", 0, now)).goals[0].progress).toBe(1);
});
it("enforces current journal privacy for goals and their progress", async () => {
  await db.insert(goals).values(training);
  await seedFixtureFriendship(db, "owner", "friend");
  expect((await getGoalPage(db, "owner", "friend", "active", 0, now)).goals).toHaveLength(1);
  await db.delete(friendships);
  expect((await getGoalPage(db, "owner", "friend", "active", 0, now)).goals).toEqual([]);
  await db.update(user).set({ journalVisibility: "public" }).where(eq(user.id, "owner"));
  expect((await getGoalPage(db, "owner", "friend", "active", 0, now)).goals).toHaveLength(1);
  expect((await getGoalPage(db, "owner", null, "active", 0, now)).goals).toEqual([]);
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));
  expect((await getGoalPage(db, "owner", "friend", "active", 0, now)).goals).toEqual([]);
});
it("counts distinct climbing dates and first visits to direct climb areas", async () => {
  await db.insert(goals).values([
    { ...training, kind: "days" },
    { ...training, kind: "new-areas" },
  ]);
  await seedFixtureJournalEntry(db, { userId: "owner", climbId: 1, entryDate: "2026-08-20" });
  await seedFixtureJournalEntry(db, { userId: "owner", climbId: 1, entryDate: "2026-09-02" });
  await seedFixtureJournalEntry(db, { userId: "owner", climbId: 2, entryDate: "2026-09-02" });
  const page = await getGoalPage(db, "owner", "owner", "active", 0, now);
  expect(page.goals).toHaveLength(2);
  expect(page.goals.map((g) => g.progress)).toEqual([1, 1]);
});
it("retains completed weeks while starting a fresh current week", async () => {
  await db.insert(goals).values({
    ...training,
    target: 1,
    repeat: "week",
    timeframe: "week",
    startDate: "2026-08-31",
    endDate: "2026-09-06",
  });
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  expect((await getGoalPage(db, "owner", "owner", "active", 0, now)).goals[0]).toMatchObject({
    periodStart: "2026-09-07",
    periodEnd: "2026-09-13",
    progress: 0,
  });
  expect((await getGoalPage(db, "owner", "owner", "completed", 0, now)).goals[0]).toMatchObject({
    periodStart: "2026-08-31",
    progress: 1,
  });
});

it("counts dated original sends once, exposes all climb names, and protects the detail list", async () => {
  const { seedFixtureSend } = await import("@/test/fixtures");
  const { getGoalContributions } = await import("@/db/queries/goals");
  const [goal] = await db
    .insert(goals)
    .values({ ...training, kind: "volume", discipline: "boulder", grade: null, target: 2 })
    .returning();
  await seedFixtureSend(db, { userId: "owner", climbId: 1, dateSent: "2026-09-02" });
  await seedFixtureSend(db, { userId: "owner", climbId: 2, dateSent: "2026-09-03" });
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    climbId: 1,
    entryDate: "2026-09-04",
    sent: true,
  });
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    climbId: 1,
    entryDate: "2026-09-02",
    sent: true,
    isAscent: true,
  });
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    climbId: 2,
    entryDate: "2026-09-03",
    sent: true,
    isAscent: true,
  });
  const page = await getGoalPage(db, "owner", "owner", "completed", 0, now);
  expect(page.goals[0]).toMatchObject({ progress: 2, completedDate: "2026-09-03" });
  expect(
    await getGoalContributions(db, "owner", "owner", goal.id, "2026-09-01", now),
  ).toMatchObject([
    { id: 1, name: "Test Highball", type: "climb" },
    { id: 2, name: "Test Slab", type: "climb" },
  ]);
  expect(await getGoalContributions(db, "owner", "friend", goal.id, "2026-09-01", now)).toEqual([]);
});

it("groups recurring achievements and includes missed weeks without counting the current week", async () => {
  await db.insert(goals).values({
    ...training,
    target: 1,
    repeat: "week",
    timeframe: "week",
    startDate: "2026-08-10",
    endDate: "2026-08-16",
  });
  for (const entryDate of ["2026-08-11", "2026-08-18", "2026-09-01"])
    await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate });
  const active = await getGoalPage(db, "owner", "owner", "active", 0, now);
  expect(active.goals[0].recurring).toBeUndefined();
  const completed = await getGoalPage(db, "owner", "owner", "completed", 0, now);
  expect(completed.goals).toHaveLength(1);
  expect(completed.goals[0].recurring).toMatchObject({ met: 3, total: 4 });
  expect(completed.summary).toMatchObject({ achieved: 1 });
  expect((await getGoalPage(db, "owner", "friend", "completed", 0, now)).goals).toEqual([]);
  await db.delete(journalEntries).where(eq(journalEntries.entryDate, "2026-09-01"));
  expect(
    (await getGoalPage(db, "owner", "owner", "completed", 0, now)).goals[0].recurring,
  ).toMatchObject({
    met: 2,
    total: 4,
  });
});

it("counts exact versus minimum grades and keeps the matching climb details consistent", async () => {
  const { getGoalContributions } = await import("./goals");
  await db
    .insert(climbs)
    .values({ id: 5, areaId: 4, name: "Harder boulder", type: "boulder", grade: 6 });
  const inserted = await db
    .insert(goals)
    .values([
      {
        ...training,
        kind: "volume",
        target: 8,
        discipline: "boulder",
        grade: 5,
        gradeMatch: "exact",
      },
      {
        ...training,
        kind: "volume",
        target: 8,
        discipline: "boulder",
        grade: 5,
        gradeMatch: "at-least",
      },
    ])
    .returning();
  for (const climbId of [1, 2, 3, 5]) {
    await seedFixtureSend(db, { userId: "owner", climbId, dateSent: "2026-09-02" });
    await seedFixtureJournalEntry(db, {
      userId: "owner",
      climbId,
      entryDate: "2026-09-02",
      sent: true,
      isAscent: true,
    });
  }
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    climbId: 5,
    entryDate: "2026-09-03",
    sent: true,
    isAscent: false,
  });
  const page = await getGoalPage(db, "owner", "owner", "active", 0, now);
  expect(page.goals.map((g) => [g.gradeMatch, g.progress])).toEqual([
    ["exact", 1],
    ["at-least", 2],
  ]);
  expect(
    await getGoalContributions(db, "owner", "owner", inserted[1].id, "2026-09-01", now),
  ).toMatchObject([{ id: 5 }, { id: 1 }]);
});

it("includes this month's met target in completed history before month end", async () => {
  const [goal] = await db
    .insert(goals)
    .values({ ...training, target: 1, repeat: "month" })
    .returning();
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  const page = await getGoalPage(db, "owner", "owner", "completed", 0, now);
  expect(page.goals).toMatchObject([{ id: goal.id, recurring: { met: 1, total: 1 } }]);
  const { getRecurringGoalHistory } = await import("./goals");
  expect(
    (await getRecurringGoalHistory(db, "owner", "owner", goal.id, 0, now)).periods,
  ).toMatchObject([{ periodStart: "2026-09-01", progress: 1 }]);
});

it("pages only the requested routine and requested whole months", async () => {
  const { getRecurringGoalHistory } = await import("./goals");
  const [routine] = await db
    .insert(goals)
    .values({
      ...training,
      target: 1,
      repeat: "week",
      timeframe: "week",
      startDate: "2026-04-06",
      endDate: "2026-04-12",
    })
    .returning();
  await db
    .insert(goals)
    .values({ ...training, repeat: "month", startDate: "2025-01-01", endDate: "2025-01-31" });
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-08-04" });
  const first = await getRecurringGoalHistory(db, "owner", "owner", routine.id, 0, now);
  expect(first.periods.filter((p) => p.periodStart.startsWith("2026-08"))).toHaveLength(5);
  expect(first.periods.find((p) => p.periodStart === "2026-08-03")?.progress).toBe(1);
  expect(new Set(first.periods.map((p) => p.id))).toEqual(new Set([routine.id]));
  const second = await getRecurringGoalHistory(
    db,
    "owner",
    "owner",
    routine.id,
    first.nextOffset,
    now,
    first.anchorMonth,
  );
  expect(second.periods[0].periodStart).toBe("2026-06-29");
  expect(second.hasMore).toBe(false);
  expect(
    (await getRecurringGoalHistory(db, "owner", "friend", routine.id, 0, now)).periods,
  ).toEqual([]);
});

it("resets yearly climb volume and bounds contribution lists to real owned periods", async () => {
  const { getGoalContributions, getRecurringGoalHistory } = await import("./goals");
  const [goal] = await db
    .insert(goals)
    .values({
      ...training,
      kind: "volume",
      discipline: "boulder",
      grade: 5,
      repeat: "year",
      timeframe: "year",
      target: 1,
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    })
    .returning();
  await seedFixtureSend(db, { userId: "owner", climbId: 1, dateSent: "2025-12-31" });
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    climbId: 1,
    entryDate: "2025-12-31",
    sent: true,
    isAscent: true,
  });
  const active = await getGoalPage(db, "owner", "owner", "active", 0, now);
  expect(active.goals[0]).toMatchObject({
    progress: 0,
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
  });
  const history = await getRecurringGoalHistory(db, "owner", "owner", goal.id, 0, now);
  expect(history.periods).toHaveLength(2);
  expect(history.periods[1]).toMatchObject({ progress: 1, completedDate: "2025-12-31" });
  expect(
    await getGoalContributions(db, "owner", "owner", goal.id, "2025-01-01", now),
  ).toMatchObject([{ id: 1, type: "climb" }]);
  expect(await getGoalContributions(db, "owner", "owner", goal.id, "2025-02-01", now)).toEqual([]);
  expect(await getGoalContributions(db, "owner", "friend", goal.id, "2025-01-01", now)).toEqual([]);
});

it("counts each new direct area only in the month it was first visited", async () => {
  await db.insert(goals).values({
    ...training,
    kind: "new-areas",
    repeat: "month",
    target: 1,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
  });
  await seedFixtureJournalEntry(db, { userId: "owner", climbId: 1, entryDate: "2026-08-20" });
  await seedFixtureJournalEntry(db, { userId: "owner", climbId: 1, entryDate: "2026-09-02" });
  expect((await getGoalPage(db, "owner", "owner", "active", 0, now)).goals[0].progress).toBe(0);
  expect((await getGoalPage(db, "owner", "owner", "completed", 0, now)).goals[0]).toMatchObject({
    progress: 1,
    periodStart: "2026-08-01",
  });
});

it("completes a grade milestone on a harder original send", async () => {
  const [goal] = await db
    .insert(goals)
    .values({ ...training, kind: "grade", discipline: "boulder", grade: 2, target: 1 })
    .returning();
  await seedFixtureSend(db, { userId: "owner", climbId: 1, dateSent: "2026-09-02" });
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    climbId: 1,
    entryDate: "2026-09-02",
    sent: true,
    isAscent: true,
  });
  const page = await getGoalPage(db, "owner", "owner", "completed", 0, now);
  expect(page.goals.find((row) => row.id === goal.id)).toMatchObject({
    progress: 1,
    completedDate: "2026-09-02",
  });
});
