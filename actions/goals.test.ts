import { env } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { saveGoal, deleteGoal, endRecurringGoal } from "@/actions/goals";
import { createDb } from "@/db/client";
import { goals } from "@/db/schema";
import { seedFixtureUser, seedFixtureJournalEntry } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const identity = vi.hoisted(() => ({ id: "owner" as string | null }));
vi.mock("next/cache", () => ({
  refresh: vi.fn<() => void>(),
  revalidatePath: vi.fn<() => void>(),
}));
vi.mock("@/lib/session", async () => {
  const { NotSignedInError } = await import("@/lib/action-result");
  return {
    requireSession: async () => {
      if (!identity.id) throw new NotSignedInError();
      return { user: { id: identity.id } };
    },
  };
});
vi.mock("@/lib/rate-limit", () => ({ allowJournalWrite: async () => true }));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);
const input = {
  kind: "training",
  target: 2,
  discipline: null,
  grade: null,
  timeframe: "month",
  repeat: "none",
  endDate: "2026-09-30",
  timezone: "UTC",
};
beforeEach(async () => {
  identity.id = "owner";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
  await resetDb(db);
  await seedFixtureUser(db, { id: "owner" });
  await seedFixtureUser(db, { id: "other" });
});
afterEach(() => vi.useRealTimers());

it("uses session ownership and rejects changing or deleting someone else’s goal", async () => {
  const result = await saveGoal(null, input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.error);
  identity.id = "other";
  expect((await saveGoal(result.value, { ...input, target: 5 })).ok).toBe(false);
  expect((await deleteGoal(result.value)).ok).toBe(false);
  expect(await db.select().from(goals)).toMatchObject([{ userId: "owner", target: 2 }]);
  identity.id = null;
  expect((await saveGoal(null, input)).ok).toBe(false);
});
it("enforces the five-active-goal cap atomically, and deletion frees a slot", async () => {
  const results = await Promise.all(Array.from({ length: 6 }, () => saveGoal(null, input)));
  expect(results.filter((r) => r.ok)).toHaveLength(5);
  expect(await db.select().from(goals)).toHaveLength(5);
  const first = results.find((r) => r.ok);
  if (!first?.ok) throw Error("Missing created goal");
  expect((await deleteGoal(first.value)).ok).toBe(true);
  expect((await saveGoal(null, input)).ok).toBe(true);
});
it("rejects invalid grade and recurrence combinations without writing", async () => {
  expect(
    (await saveGoal(null, { ...input, kind: "grade", grade: 100, discipline: "boulder" })).ok,
  ).toBe(false);
  expect((await saveGoal(null, { ...input, kind: "training", repeat: "year" })).ok).toBe(false);
  expect(await db.select().from(goals)).toEqual([]);
});
it("completed nonrecurring goals no longer consume capacity", async () => {
  for (let i = 0; i < 5; i += 1) expect((await saveGoal(null, input)).ok).toBe(true);
  const rows = await db.select().from(goals);
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    kind: "training",
    entryDate: rows[0].startDate,
  });
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    kind: "training",
    entryDate: rows[0].startDate,
  });
  expect((await saveGoal(null, input)).ok).toBe(true);
});

it("preserves earlier weekly targets when an owner edits the recurring goal", async () => {
  const [goal] = await db
    .insert(goals)
    .values({
      userId: "owner",
      kind: "training",
      target: 1,
      timeframe: "week",
      repeat: "week",
      startDate: "2026-08-31",
      endDate: "2026-09-06",
      timezone: "UTC",
    })
    .returning();
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-01" });
  const result = await saveGoal(goal.id, {
    ...input,
    target: 3,
    timeframe: "week",
    repeat: "week",
  });
  expect(result.ok).toBe(true);
  const { getGoalPage } = await import("@/db/queries/goals");
  const history = await getGoalPage(db, "owner", "owner", "completed");
  expect(history.goals).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ target: 1, progress: 1, periodStart: "2026-08-31" }),
    ]),
  );
  expect((await getGoalPage(db, "owner", "owner", "active")).goals[0]).toMatchObject({
    target: 3,
    progress: 0,
  });
});

it("only accepts a new grade above the owner's earlier best", async () => {
  const { seedFixtureTree, seedFixtureSend } = await import("@/test/fixtures");
  await seedFixtureTree(db);
  await seedFixtureSend(db, { userId: "owner", climbId: 1, dateSent: "2026-01-01" });
  const { getNextGoalGrades } = await import("@/db/queries/goals");
  expect(await getNextGoalGrades(db, "owner", "owner")).toMatchObject({ boulder: 6 });
  expect(await getNextGoalGrades(db, "owner", "other")).toEqual({});
  expect(
    (await saveGoal(null, { ...input, kind: "grade", discipline: "boulder", grade: 2, target: 1 }))
      .ok,
  ).toBe(false);
  expect(
    (await saveGoal(null, { ...input, kind: "grade", discipline: "boulder", grade: 6, target: 1 }))
      .ok,
  ).toBe(true);
});

it("uses and edits an explicit seasonal start date, including existing logs in that range", async () => {
  const { getGoalPage } = await import("@/db/queries/goals");
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-05-31" });
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-06-02" });
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  const seasonal = {
    ...input,
    target: 10,
    timeframe: "custom",
    startDate: "2026-06-01",
    endDate: "2026-11-30",
  };
  const result = await saveGoal(null, seasonal);
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.error);
  expect((await db.select().from(goals))[0]).toMatchObject({
    startDate: "2026-06-01",
    endDate: "2026-11-30",
  });
  expect(
    (await getGoalPage(db, "owner", "owner", "active", 0, new Date("2026-09-12T12:00:00Z")))
      .goals[0].progress,
  ).toBe(2);
  expect((await saveGoal(result.value, { ...seasonal, startDate: "2026-09-01" })).ok).toBe(true);
  expect(
    (await getGoalPage(db, "owner", "owner", "active", 0, new Date("2026-09-12T12:00:00Z")))
      .goals[0].progress,
  ).toBe(1);
});
it("rejects a reversed seasonal range without writing", async () => {
  expect(
    (
      await saveGoal(null, {
        ...input,
        timeframe: "custom",
        startDate: "2026-12-01",
        endDate: "2026-11-30",
      })
    ).ok,
  ).toBe(false);
  expect(await db.select().from(goals)).toEqual([]);
});

it("allows editing an achieved goal at capacity without allowing reactivation above the limit", async () => {
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  const completed = await saveGoal(null, { ...input, target: 1 });
  expect(completed.ok).toBe(true);
  if (!completed.ok) throw new Error("Expected completed fixture goal");
  for (let i = 0; i < 5; i += 1)
    expect((await saveGoal(null, { ...input, target: 100 })).ok).toBe(true);
  expect((await saveGoal(completed.value, { ...input, target: 1 })).ok).toBe(true);
  expect((await saveGoal(completed.value, { ...input, target: 2 })).ok).toBe(false);
  expect((await db.select().from(goals)).find((goal) => goal.id === completed.value)?.target).toBe(
    1,
  );
});

it("preserves the old climb definition when editing a yearly routine into another goal", async () => {
  const { seedFixtureTree, seedFixtureSend } = await import("@/test/fixtures");
  const { getRecurringGoalHistory, getGoalContributions } = await import("@/db/queries/goals");
  await seedFixtureTree(db);
  const [old] = await db
    .insert(goals)
    .values({
      userId: "owner",
      kind: "volume",
      discipline: "boulder",
      grade: 5,
      gradeMatch: "at-least",
      target: 1,
      repeat: "year",
      timeframe: "year",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      timezone: "UTC",
    })
    .returning();
  await seedFixtureSend(db, { userId: "owner", climbId: 1, dateSent: "2025-06-15" });
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    climbId: 1,
    entryDate: "2025-06-15",
    sent: true,
    isAscent: true,
  });
  expect((await saveGoal(old.id, { ...input, kind: "days", target: 2, repeat: "month" })).ok).toBe(
    true,
  );
  const history = await getRecurringGoalHistory(
    db,
    "owner",
    "owner",
    old.id,
    12,
    new Date("2026-09-11T12:00:00Z"),
  );
  expect(history.periods.find((period) => period.periodStart === "2025-01-01")).toMatchObject({
    repeat: "year",
    target: 1,
    progress: 1,
  });
  expect(
    await getGoalContributions(
      db,
      "owner",
      "owner",
      old.id,
      "2025-01-01",
      new Date("2026-09-11T12:00:00Z"),
    ),
  ).toMatchObject([{ id: 1, type: "climb" }]);
});

it("keeps monthly and yearly periods distinct when they share January 1", async () => {
  const { seedFixtureTree, seedFixtureSend } = await import("@/test/fixtures");
  const { getGoalPage, getRecurringGoalHistory, getGoalContributions } =
    await import("@/db/queries/goals");
  await seedFixtureTree(db);
  const [old] = await db
    .insert(goals)
    .values({
      userId: "owner",
      kind: "volume",
      discipline: "boulder",
      grade: 5,
      target: 1,
      repeat: "month",
      timeframe: "month",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      timezone: "UTC",
    })
    .returning();
  await seedFixtureSend(db, { userId: "owner", climbId: 1, dateSent: "2026-01-15" });
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    climbId: 1,
    entryDate: "2026-01-15",
    sent: true,
    isAscent: true,
  });
  const yearly = {
    ...input,
    kind: "volume",
    discipline: "boulder",
    grade: 5,
    repeat: "year",
    target: 1,
  };
  expect((await saveGoal(old.id, yearly)).ok).toBe(true);
  const active = await getGoalPage(
    db,
    "owner",
    "owner",
    "active",
    0,
    new Date("2026-09-13T12:00:00Z"),
  );
  expect(active.goals).toHaveLength(1);
  expect(active.goals[0]).toMatchObject({ repeat: "year", periodStart: "2026-01-01", progress: 1 });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-09-11T12:00:00Z"));
  try {
    expect((await saveGoal(old.id, { ...yearly, target: 2 })).ok).toBe(true);
  } finally {
    vi.useRealTimers();
  }
  const history = await getRecurringGoalHistory(
    db,
    "owner",
    "owner",
    old.id,
    0,
    new Date("2027-09-11T12:00:00Z"),
  );
  const january = history.periods.filter((period) => period.periodStart === "2026-01-01");
  expect(january).toHaveLength(2);
  const checkDate = new Date("2027-09-11T12:00:00Z");
  expect(await getGoalContributions(db, "owner", "owner", old.id, "2026-01-01", checkDate)).toEqual(
    [],
  );
  expect(
    await getGoalContributions(db, "owner", "owner", old.id, "2026-01-01", checkDate, "2026-12-31"),
  ).toMatchObject([{ id: 1, type: "climb" }]);
  expect(
    await getGoalContributions(db, "owner", "owner", old.id, "2026-01-01", checkDate, "2026-01-31"),
  ).toMatchObject([{ id: 1, type: "climb" }]);
  expect(january).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ repeat: "year", target: 1, progress: 1 }),
      expect.objectContaining({ repeat: "month", target: 1, progress: 1 }),
    ]),
  );
});

it("expired goals free capacity in each goal's timezone while editing does not silently restart them", async () => {
  for (let i = 0; i < 5; i += 1)
    await db.insert(goals).values({
      userId: "owner",
      kind: "training",
      target: 8,
      timeframe: "week",
      repeat: "none",
      startDate: "2026-08-31",
      endDate: "2026-09-06",
      timezone: "UTC",
    });
  const [expired] = await db.select().from(goals);
  expect((await saveGoal(null, input)).ok).toBe(true);
  expect((await saveGoal(expired.id, { ...input, timeframe: "week", target: 9 })).ok).toBe(true);
  expect((await db.select().from(goals)).find((g) => g.id === expired.id)?.endDate).toBe(
    "2026-09-06",
  );
});

it("only acknowledges achievements owned by the session", async () => {
  const { acknowledgeGoalAchievements } = await import("./goals");
  const { getGoalOverview } = await import("@/db/queries/goals");
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  const created = await saveGoal(null, { ...input, target: 1 });
  if (!created.ok) throw new Error(created.error);
  const overview = await getGoalOverview(db, "owner", "owner", new Date("2026-09-12T12:00:00Z"));
  const pending = overview.completed.celebrations;
  expect(pending).toHaveLength(1);
  const keys = pending?.map(({ id, periodStart, repeat }) => ({ id, periodStart, repeat }));
  identity.id = "other";
  await acknowledgeGoalAchievements(keys);
  expect(
    (await getGoalOverview(db, "owner", "owner", new Date("2026-09-12T12:00:00Z"))).completed
      .celebrations,
  ).toHaveLength(1);
  identity.id = "owner";
  expect((await acknowledgeGoalAchievements(keys)).ok).toBe(true);
  expect(
    (await getGoalOverview(db, "owner", "owner", new Date("2026-09-13T12:00:00Z"))).completed
      .celebrations,
  ).toEqual([]);
});

it("does not expire Pacific goals early when a new goal uses UTC", async () => {
  for (let i = 0; i < 5; i += 1)
    await db.insert(goals).values({
      userId: "owner",
      kind: "training",
      target: 8,
      timeframe: "week",
      repeat: "none",
      startDate: "2026-08-31",
      endDate: "2026-09-06",
      timezone: "America/Los_Angeles",
    });
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-09-07T00:30:00Z"));
    expect((await saveGoal(null, input)).ok).toBe(false);
    vi.setSystemTime(new Date("2026-09-07T08:00:00Z"));
    expect((await saveGoal(null, input)).ok).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

it("archives only an owned missed goal within its decision window", async () => {
  const { archiveGoal } = await import("./goals");
  const [source] = await db
    .insert(goals)
    .values({
      userId: "owner",
      kind: "training",
      target: 8,
      timeframe: "month",
      repeat: "none",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      timezone: "UTC",
    })
    .returning();
  identity.id = "other";
  expect((await archiveGoal(source.id)).ok).toBe(false);
  identity.id = "owner";
  expect((await archiveGoal(source.id)).ok).toBe(true);
  expect((await db.select().from(goals))[0]).toMatchObject({
    target: 8,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    archiveToken: expect.any(String),
  });
  expect((await archiveGoal(source.id)).ok).toBe(false);
  expect((await saveGoal(null, input, source.id)).ok).toBe(false);
});

it("retries once atomically with fresh details while preserving the original", async () => {
  const [source] = await db
    .insert(goals)
    .values({
      userId: "owner",
      kind: "training",
      target: 8,
      timeframe: "month",
      repeat: "none",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      timezone: "UTC",
    })
    .returning();
  const results = await Promise.all([
    saveGoal(null, { ...input, target: 4 }, source.id),
    saveGoal(null, { ...input, target: 4 }, source.id),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  const rows = await db.select().from(goals);
  expect(rows).toHaveLength(2);
  expect(rows.find((g) => g.id === source.id)).toMatchObject({
    target: 8,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    archiveToken: expect.any(String),
  });
  expect(rows.find((g) => g.id !== source.id)).toMatchObject({
    target: 4,
    kind: "training",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    archiveToken: null,
    gradeMatch: "exact",
    celebrationsInitialized: true,
  });
});

it("does not archive the original when a retry cannot fit the active cap", async () => {
  const [source] = await db
    .insert(goals)
    .values({
      userId: "owner",
      kind: "training",
      target: 8,
      timeframe: "month",
      repeat: "none",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      timezone: "UTC",
    })
    .returning();
  for (let i = 0; i < 5; i += 1) expect((await saveGoal(null, input)).ok).toBe(true);
  expect((await saveGoal(null, input, source.id)).ok).toBe(false);
  expect((await db.select().from(goals)).find((g) => g.id === source.id)?.archiveToken).toBeNull();
});

it.each(["2023-01-01", null])(
  "preserves accepted milestones after importing an older send (%s)",
  async (dateSent) => {
    const { eq } = await import("drizzle-orm");
    const { climbs, journalEntries } = await import("@/db/schema");
    const { seedFixtureTree, seedFixtureSend } = await import("@/test/fixtures");
    const { getGoalPage, getGoalContributions, refreshGoalAchievements } =
      await import("@/db/queries/goals");
    const { acknowledgeGoalAchievements } = await import("@/actions/goals");
    await seedFixtureTree(db);
    const milestone = { ...input, kind: "grade", target: 1, discipline: "boulder", grade: 5 };
    const saved = await saveGoal(null, milestone);
    if (!saved.ok) throw Error(saved.error);
    await seedFixtureSend(db, { userId: "owner", climbId: 1, dateSent: "2026-09-05" });
    await seedFixtureJournalEntry(db, {
      userId: "owner",
      climbId: 1,
      entryDate: "2026-09-05",
      sent: true,
      isAscent: true,
    });
    await refreshGoalAchievements(db, "owner");
    const before = await getGoalPage(db, "owner", "owner", "completed");
    expect(before.goals).toEqual([
      expect.objectContaining({ id: saved.value, progress: 1, completedDate: "2026-09-05" }),
    ]);
    expect(before.celebrations).toHaveLength(1);
    await acknowledgeGoalAchievements([
      { id: saved.value, periodStart: "2026-09-01", repeat: "none" },
    ]);
    await db
      .insert(climbs)
      .values({ id: 10, areaId: 4, name: "Imported harder climb", type: "boulder", grade: 7 });
    await seedFixtureSend(db, { userId: "owner", climbId: 10, dateSent });
    const after = await getGoalPage(db, "owner", "owner", "completed");
    expect(after.goals).toEqual(before.goals);
    expect(after.celebrations).toEqual([]);
    expect(await getGoalContributions(db, "owner", "owner", saved.value, "2026-09-01")).toEqual([
      expect.objectContaining({ id: 1 }),
    ]);
    expect((await saveGoal(saved.value, milestone)).ok).toBe(true);
    // The completed milestone must not consume one of the five active slots.
    for (let i = 0; i < 5; i += 1) expect((await saveGoal(null, input)).ok).toBe(true);
    vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
    expect(
      (await getGoalPage(db, "owner", "owner", "active")).goals.map((g) => g.id),
    ).not.toContain(saved.value);
    expect((await getGoalPage(db, "owner", "owner", "completed")).goals.map((g) => g.id)).toContain(
      saved.value,
    );
    expect((await saveGoal(null, milestone, saved.value)).ok).toBe(false);
    // Completion still follows the qualifying log, not the stored acknowledgement.
    await db.delete(journalEntries).where(eq(journalEntries.climbId, 1));
    expect((await getGoalPage(db, "owner", "owner", "active")).goals).toContainEqual(
      expect.objectContaining({ id: saved.value, progress: 0, missed: true }),
    );
  },
);

it("preserves eligibility for ordinary edits but rechecks changed milestone criteria", async () => {
  const { seedFixtureTree, seedFixtureSend } = await import("@/test/fixtures");
  await seedFixtureTree(db);
  const milestone = {
    ...input,
    kind: "grade",
    target: 1,
    discipline: "boulder",
    grade: 5,
    timeframe: "custom",
    startDate: "2026-09-01",
  };
  const saved = await saveGoal(null, milestone);
  if (!saved.ok) throw Error(saved.error);
  await seedFixtureSend(db, { userId: "owner", climbId: 1, dateSent: "2023-01-01" });
  await seedFixtureSend(db, { userId: "owner", climbId: 3, dateSent: "2023-01-01" });
  expect((await saveGoal(saved.value, { ...milestone, endDate: "2026-10-31" })).ok).toBe(true);
  const unchanged = await db.select().from(goals);
  for (const changed of [
    { grade: 2 },
    { discipline: "sport", grade: 5 },
    { startDate: "2026-09-02" },
  ]) {
    expect((await saveGoal(saved.value, { ...milestone, ...changed })).ok).toBe(false);
    expect(await db.select().from(goals)).toEqual(unchanged);
  }
  const trainingGoal = await saveGoal(null, input);
  if (!trainingGoal.ok) throw Error(trainingGoal.error);
  expect((await saveGoal(trainingGoal.value, milestone)).ok).toBe(false);
  expect((await saveGoal(null, milestone)).ok).toBe(false);
});

it("archives finished goals without deleting their achievement or consuming active slots", async () => {
  const { archiveGoal } = await import("@/actions/goals");
  const { getGoalOverview } = await import("@/db/queries/goals");
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  const created = await saveGoal(null, { ...input, target: 1 });
  if (!created.ok) throw Error(created.error);
  identity.id = "other";
  expect((await archiveGoal(created.value)).ok).toBe(false);
  identity.id = "owner";
  expect((await archiveGoal(created.value)).ok).toBe(true);
  const overview = await getGoalOverview(db, "owner", "owner");
  expect(overview.active.goals).toEqual([]);
  expect(overview.completed.goals).toMatchObject([
    { id: created.value, archived: true, completedDate: "2026-09-02" },
  ]);
  expect((await saveGoal(created.value, input)).ok).toBe(false);
});

it("counts only sessions matching a goal's saved hashtags", async () => {
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    kind: "training",
    entryDate: "2026-09-02",
    tags: ["strength"],
  });
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-03" });
  const created = await saveGoal(null, { ...input, tags: ["hangboard", "strength"] });
  if (!created.ok) throw Error(created.error);
  const { getGoalOverview } = await import("@/db/queries/goals");
  let overview = await getGoalOverview(db, "owner", "owner");
  expect(overview.active.goals[0]).toMatchObject({ progress: 0, completedDate: null });
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    kind: "training",
    entryDate: "2026-09-04",
    tags: ["hangboard", "strength"],
  });
  overview = await getGoalOverview(db, "owner", "owner");
  expect(overview.active.goals[0]).toMatchObject({ progress: 1, tags: ["hangboard", "strength"] });
});

it("preserves a recurring period's hashtag filter when the next month changes", async () => {
  const saved = await saveGoal(null, { ...input, repeat: "month", tags: ["hangboard"] });
  if (!saved.ok) throw Error(saved.error);
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    kind: "training",
    entryDate: "2026-09-02",
    tags: ["hangboard"],
  });
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    kind: "training",
    entryDate: "2026-09-03",
    tags: ["strength"],
  });
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  expect((await saveGoal(saved.value, { ...input, repeat: "month", tags: ["strength"] })).ok).toBe(
    true,
  );
  const { getRecurringGoalHistory } = await import("@/db/queries/goals");
  const history = await getRecurringGoalHistory(db, "owner", "owner", saved.value);
  expect(history.periods.find((period) => period.periodStart === "2026-09-01")).toMatchObject({
    progress: 1,
    tags: ["hangboard"],
  });
});

it("keeps hashtag-filtered goals within the five-active limit", async () => {
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-02" });
  const tagged = { ...input, target: 1, tags: ["hangboard"] };
  for (let i = 0; i < 5; i += 1) expect((await saveGoal(null, tagged)).ok).toBe(true);
  expect((await saveGoal(null, tagged)).ok).toBe(false);
  await seedFixtureJournalEntry(db, {
    userId: "owner",
    kind: "training",
    entryDate: "2026-09-03",
    tags: ["hangboard"],
  });
  expect((await saveGoal(null, tagged)).ok).toBe(true);
});

it("ends weekly routines on a chosen inclusive date and releases capacity at local midnight", async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      saveGoal(null, {
        ...input,
        repeat: "week",
        timeframe: "week",
        timezone: "America/Los_Angeles",
      }),
    ),
  );
  const routine = results[0];
  if (!routine.ok) throw Error(routine.error);
  expect((await endRecurringGoal(routine.value, "2026-09-10")).ok).toBe(false);
  expect((await endRecurringGoal(routine.value, "2026-02-30")).ok).toBe(false);
  identity.id = "other";
  expect((await endRecurringGoal(routine.value, "2026-09-11")).ok).toBe(false);
  identity.id = "owner";
  expect((await endRecurringGoal(routine.value, "2026-09-11")).ok).toBe(true);
  vi.setSystemTime(new Date("2026-09-12T06:59:59Z"));
  expect((await saveGoal(null, input)).ok).toBe(false);
  vi.setSystemTime(new Date("2026-09-12T07:00:00Z"));
  expect((await saveGoal(null, input)).ok).toBe(true);
  expect((await endRecurringGoal(routine.value, "2026-10-01")).ok).toBe(false);
  expect((await saveGoal(routine.value, { ...input, repeat: "week" })).ok).toBe(false);
  const { getGoalOverview } = await import("@/db/queries/goals");
  const overview = await getGoalOverview(db, "owner", "owner");
  expect(overview.active.goals.some((g) => g.id === routine.value)).toBe(false);
  expect(overview.completed.goals).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: routine.value,
        recurringEndDate: "2026-09-11",
        periodEnd: "2026-09-11",
        progress: 0,
      }),
    ]),
  );
});

it("retains scheduled stops through edits and preserves old cadence history", async () => {
  const [routine] = await db
    .insert(goals)
    .values({
      userId: "owner",
      kind: "training",
      target: 1,
      timeframe: "week",
      repeat: "week",
      startDate: "2026-08-31",
      endDate: "2026-09-06",
      timezone: "UTC",
    })
    .returning();
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-09-01" });
  expect((await endRecurringGoal(routine.id, "2026-09-30")).ok).toBe(true);
  expect((await saveGoal(routine.id, { ...input, repeat: "month" })).ok).toBe(true);
  expect((await db.select().from(goals))[0].recurringEndDate).toBe("2026-09-30");
  expect((await endRecurringGoal(routine.id, "2026-09-11")).ok).toBe(true);
  const { getGoalOverview } = await import("@/db/queries/goals");
  const overview = await getGoalOverview(db, "owner", "owner", new Date("2027-03-01T12:00:00Z"));
  expect(overview.active.goals).toHaveLength(0);
  expect(overview.completed.goals[0].recurring?.recent).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ repeat: "week", periodStart: "2026-08-31", progress: 1 }),
    ]),
  );
});

it("creates a routine with its end date in the same save, then allows changing or removing it", async () => {
  const result = await saveGoal(null, {
    ...input,
    repeat: "month",
    recurringEndDate: "2026-09-20",
  });
  if (!result.ok) throw Error(result.error);
  expect((await db.select().from(goals))[0].recurringEndDate).toBe("2026-09-20");
  expect(
    (await saveGoal(result.value, { ...input, repeat: "month", recurringEndDate: "2026-09-30" }))
      .ok,
  ).toBe(true);
  expect((await db.select().from(goals))[0].recurringEndDate).toBe("2026-09-30");
  expect(
    (await saveGoal(result.value, { ...input, repeat: "month", recurringEndDate: null })).ok,
  ).toBe(true);
  expect((await db.select().from(goals))[0].recurringEndDate).toBeNull();
  expect(
    (await saveGoal(null, { ...input, repeat: "week", recurringEndDate: "2026-09-10" })).ok,
  ).toBe(false);
  expect(
    (await saveGoal(null, { ...input, repeat: "week", recurringEndDate: "2026-02-30" })).ok,
  ).toBe(false);
  expect((await saveGoal(null, { ...input, recurringEndDate: "2026-09-20" })).ok).toBe(false);
});
