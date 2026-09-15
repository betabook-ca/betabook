import { env } from "cloudflare:test";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { areas, climbs, goals, friendships, journalEntries, sends, user } from "@/db/schema";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";
import { DEFAULT_USER_SENDS_FILTER } from "@/lib/filters/user-sends-filter";
import {
  seedFixtureJournalEntry,
  seedFixtureFriendship,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
  seedManyAreas,
} from "@/test/fixtures";
import { explainQueries } from "@/test/query-plans";
import { resetDb } from "@/test/reset-db";

import { getFeedPage } from "./feed";
import { refreshGoalAchievements } from "./goals";
import { getJournalPage } from "./journal";
import { getSendsForUserPage } from "./sends";

const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  for (const id of ["viewer", "public", "quiet", "private", "stranger"]) {
    await seedFixtureUser(db, {
      id,
      isPrivate: id === "private",
      journalVisibility: id === "quiet" ? "private" : "public",
      sendCommentVisibility: id === "quiet" ? "private" : "public",
    });
  }
  for (const friend of ["public", "quiet", "private"])
    await seedFixtureFriendship(db, "viewer", friend);
  for (const userId of ["public", "quiet", "private", "stranger", "viewer"]) {
    await seedFixtureSend(db, {
      userId,
      climbId: 1,
      dateSent: "2026-09-01",
      comment: `${userId} send note`,
    });
    await seedFixtureJournalEntry(db, {
      userId,
      climbId: 1,
      entryDate: "2026-09-01",
      sent: true,
      isAscent: true,
      body: `${userId} send note`,
    });
    await seedFixtureJournalEntry(db, {
      userId,
      kind: "training",
      entryDate: "2026-09-01",
      body: `${userId} training note`,
    });
  }
  await seedFixtureJournalEntry(db, {
    userId: "public",
    climbId: 1,
    entryDate: "2026-09-01",
    sent: true,
    body: "Repeat note",
  });
  await seedFixtureJournalEntry(db, {
    userId: "public",
    climbId: 2,
    entryDate: "2026-09-01",
    body: "Session note",
  });
  await seedFixtureSend(db, { userId: "public", climbId: 2, dateSent: null, comment: "Undated" });
});

it("returns connected public climber/day groups, deduplicates ascents, and bounds previews", async () => {
  const page = await getFeedPage(db, "viewer");
  expect(page.days.map((d) => d.userId)).toEqual(["quiet", "public"]);
  expect(page.days[0]).toMatchObject({
    journalVisible: false,
    sends: 1,
    repeats: 0,
    sessions: 0,
    training: 0,
    activities: [{ kind: "send", body: null }],
  });
  expect(page.days[1]).toMatchObject({
    journalVisible: true,
    sends: 1,
    repeats: 1,
    sessions: 1,
    training: 1,
  });
  expect(page.days[1].activities).toHaveLength(3);
  expect(page.days[1].activities[0]).toMatchObject({
    kind: "send",
    climbId: 1,
    climbName: "Test Highball",
    areaName: "Test Highball Alcove",
  });
  expect(JSON.stringify(page)).not.toContain("quiet training note");
  expect(JSON.stringify(page)).not.toContain("Undated");
});

it("carries each climber's own grade and feel for the same climb", async () => {
  await db
    .update(sends)
    .set({ suggestedGrade: 7, gradeFeel: "high" })
    .where(and(eq(sends.userId, "public"), eq(sends.climbId, 1)));
  await db
    .update(sends)
    .set({ suggestedGrade: 3, gradeFeel: "low" })
    .where(and(eq(sends.userId, "quiet"), eq(sends.climbId, 1)));

  const [quiet, shared] = (await getFeedPage(db, "viewer")).days;
  expect(quiet.activities).toMatchObject([
    { kind: "send", climbId: 1, climbGrade: 5, reportedGrade: 3, gradeFeel: "low" },
  ]);
  expect(shared.activities).toMatchObject([
    { kind: "send", climbId: 1, climbGrade: 5, reportedGrade: 7, gradeFeel: "high" },
    { kind: "repeat", climbId: 1, reportedGrade: 7, gradeFeel: "high" },
    { kind: "session", climbId: 2, reportedGrade: null, gradeFeel: null },
  ]);

  await seedFixtureJournalEntry(db, { userId: "public", climbId: 3, entryDate: "2026-09-02" });
  expect((await getFeedPage(db, "viewer")).days[0].activities).toMatchObject([
    { kind: "session", climbId: 3, climbGrade: 10, reportedGrade: null, gradeFeel: null },
  ]);
});

it.each(["2026-09-02", null])(
  "keeps sessions gradeless after a later send is logged and edited (send date %s)",
  async (dateSent) => {
    await seedFixtureJournalEntry(db, {
      userId: "public",
      climbId: 3,
      entryDate: "2026-08-30",
      body: "Still working the moves.",
    });
    const sessionDay = async () =>
      (await getFeedPage(db, "viewer")).days.find(
        (day) => day.userId === "public" && day.date === "2026-08-30",
      );
    const original = await sessionDay();
    expect(original?.activities).toMatchObject([
      { kind: "session", climbId: 3, climbGrade: 10, reportedGrade: null, gradeFeel: null },
    ]);
    await seedFixtureSend(db, {
      userId: "public",
      climbId: 3,
      dateSent,
      suggestedGrade: 12,
      gradeFeel: "high",
    });
    expect(await sessionDay()).toEqual(original);
    await db
      .update(sends)
      .set({ suggestedGrade: 14, gradeFeel: "low" })
      .where(and(eq(sends.userId, "public"), eq(sends.climbId, 3)));
    expect(await sessionDay()).toEqual(original);
    if (dateSent) {
      const sentDay = (await getFeedPage(db, "viewer", "sends")).days.find(
        (day) => day.userId === "public" && day.date === dateSent,
      );
      expect(sentDay?.activities).toMatchObject([
        { kind: "send", climbId: 3, reportedGrade: 14, gradeFeel: "low" },
      ]);
    }
  },
);

it.each(["all", "sends"] as const)(
  "returns the nearest two area ancestors in %s previews with indexed lookups",
  async (view) => {
    await db.insert(areas).values({ id: 10, name: "Test Region" });
    await db.update(areas).set({ parentId: 10 }).where(eq(areas.id, 1));
    await db.update(climbs).set({ areaId: 1 }).where(eq(climbs.id, 3));
    await db.update(climbs).set({ areaId: 10 }).where(eq(climbs.id, 4));
    for (const climbId of [3, 4]) {
      await seedFixtureSend(db, { userId: "public", climbId, dateSent: "2026-09-02" });
    }
    await seedFixtureJournalEntry(db, {
      userId: "public",
      kind: "training",
      entryDate: "2026-09-03",
      body: "Mobility",
    });

    const page = await getFeedPage(db, "viewer", view);
    expect(page.days.find((day) => day.userId === "quiet")?.activities).toMatchObject([
      {
        climbId: 1,
        areaId: 4,
        areaName: "Test Highball Alcove",
        areaAncestors: [
          { id: 1, name: "Test Crag" },
          { id: 2, name: "Test Boulders" },
        ],
      },
    ]);
    expect(page.days.find((day) => day.date === "2026-09-02")?.activities).toMatchObject([
      { climbId: 3, areaId: 1, areaAncestors: [{ id: 10, name: "Test Region" }] },
      { climbId: 4, areaId: 10, areaAncestors: [] },
    ]);
    expect(page.days.filter((day) => day.date === "2026-09-03")).toMatchObject(
      view === "all" ? [{ activities: [{ kind: "training", areaAncestors: [] }] }] : [],
    );

    await seedManyAreas(db, 200, 100);
    expect(await getFeedPage(db, "viewer", view)).toEqual(page);
    const plans = await explainQueries(db, () => getFeedPage(db, "viewer", view));
    expect(plans).toHaveLength(1);
    const details = plans[0].map((row) => row.detail).join("\n");
    expect(details).toMatch(/SEARCH reported USING INDEX sends_user_climb_unique/);
    expect(details).toMatch(/SEARCH area_parent USING INTEGER PRIMARY KEY/);
    expect(details).toMatch(/SEARCH area_grandparent USING INTEGER PRIMARY KEY/);
  },
);

it("pages whole days across tied dates without missing or duplicating climbers", async () => {
  const first = await getFeedPage(db, "viewer", "all", null, 1);
  expect(first.days.map((d) => d.userId)).toEqual(["quiet"]);
  expect(first.hasMore).toBe(true);
  const second = await getFeedPage(
    db,
    "viewer",
    "all",
    { version: 1, date: first.days[0].date, userId: first.days[0].userId, view: "all" },
    1,
  );
  expect(second.days.map((d) => d.userId)).toEqual(["public"]);
  expect(second.days[0].training).toBe(1);
  expect(second.hasMore).toBe(false);
});

it("filters sends before calculating group counts and supports training-only days", async () => {
  await seedFixtureJournalEntry(db, {
    userId: "public",
    kind: "training",
    entryDate: "2026-09-02",
    body: "Hangboard",
  });
  const all = await getFeedPage(db, "viewer");
  expect(all.days[0]).toMatchObject({
    date: "2026-09-02",
    sends: 0,
    training: 1,
    activities: [{ kind: "training", body: "Hangboard", climbId: null }],
  });
  const filtered = await getFeedPage(db, "viewer", "sends");
  expect(filtered.days.map((d) => [d.userId, d.date, d.sends, d.training])).toEqual([
    ["quiet", "2026-09-01", 1, 0],
    ["public", "2026-09-01", 1, 0],
  ]);
});

it("honors journal and profile privacy changes and friend removal on subsequent reads", async () => {
  expect((await getFeedPage(db, "viewer")).days).toHaveLength(2);
  await db.update(user).set({ journalVisibility: "private" }).where(eq(user.id, "public"));
  expect((await getFeedPage(db, "viewer")).days[1]).toMatchObject({
    sends: 1,
    training: 0,
    repeats: 0,
    sessions: 0,
  });
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "quiet"));
  expect((await getFeedPage(db, "viewer")).days.map((d) => d.userId)).toEqual(["public"]);
  await db.delete(friendships).where(eq(friendships.userId, "public"));
  expect(await getFeedPage(db, "viewer")).toEqual({ days: [], hasMore: false });
});

it("sorts historical imports by climbing date and reflects deleted sends becoming sessions", async () => {
  await seedFixtureSend(db, { userId: "public", climbId: 3, dateSent: "2020-01-01" });
  expect((await getFeedPage(db, "viewer")).days.map((d) => d.date)).toEqual([
    "2026-09-01",
    "2026-09-01",
    "2020-01-01",
  ]);
  await db.delete(sends).where(eq(sends.userId, "public"));
  const page = await getFeedPage(db, "viewer");
  expect(page.days.map((d) => d.date)).toEqual(["2026-09-01", "2026-09-01"]);
  expect(page.days[1]).toMatchObject({ sends: 0, repeats: 0, sessions: 3, training: 1 });
  await db.delete(journalEntries).where(eq(journalEntries.userId, "public"));
  expect((await getFeedPage(db, "viewer")).days.map((d) => d.userId)).toEqual(["quiet"]);
});

it("filters journal and sends detail views to the selected day", async () => {
  await seedFixtureJournalEntry(db, {
    userId: "public",
    kind: "training",
    entryDate: "2026-09-02",
    body: "Next day",
  });
  const journal = await getJournalPage(db, "public", "viewer", {
    ...DEFAULT_JOURNAL_FILTER,
    date: "2026-09-02",
  });
  expect(journal.entries.map((e) => e.body)).toEqual(["Next day"]);
  await seedFixtureSend(db, { userId: "public", climbId: 3, dateSent: "2026-09-02" });
  const page = await getSendsForUserPage(
    db,
    "public",
    { ...DEFAULT_USER_SENDS_FILTER, date: "2026-09-02" },
    0,
  );
  expect(page.sends.map((s) => s.climbId)).toEqual([3]);
});

it("reads persisted accomplishments and retains them after archive and acknowledgement", async () => {
  const [goal] = await db
    .insert(goals)
    .values({
      userId: "public",
      kind: "training",
      target: 1,
      timeframe: "month",
      repeat: "none",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      timezone: "UTC",
      celebrationsInitialized: true,
    })
    .returning();
  await refreshGoalAchievements(db, "public");
  const page = await getFeedPage(db, "viewer");
  expect(page.days.find((day) => day.userId === "public")?.activities[0]).toMatchObject({
    kind: "goal",
    goalTitle: "Train 1 time",
  });
  expect(await db.all(sql`SELECT goal_id,completed_date FROM goal_completions`)).toEqual([
    { goal_id: goal.id, completed_date: "2026-09-01" },
  ]);
  await db.update(goals).set({ archiveToken: "archived" }).where(eq(goals.id, goal.id));
  const { getGoalOverview } = await import("./goals");
  await getGoalOverview(db, "public", "public");
  await db.run(sql`UPDATE goal_achievements SET acknowledged_at='2026-09-12'`);
  expect(
    (await getFeedPage(db, "viewer")).days.find((day) => day.userId === "public")?.activities[0]
      .kind,
  ).toBe("goal");
  expect(JSON.stringify(await getFeedPage(db, "viewer", "sends"))).not.toContain('"kind":"goal"');
  await db
    .delete(journalEntries)
    .where(and(eq(journalEntries.userId, "public"), eq(journalEntries.kind, "training")));
  await refreshGoalAchievements(db, "public");
  expect(JSON.stringify(await getFeedPage(db, "viewer"))).not.toContain('"kind":"goal"');
  expect(await db.all(sql`SELECT * FROM goal_completions`)).toEqual([]);
});

it("rechecks goal activity audiences, friendship and profile privacy", async () => {
  await db.insert(goals).values({
    userId: "public",
    kind: "training",
    target: 1,
    timeframe: "month",
    repeat: "none",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    timezone: "UTC",
  });
  await refreshGoalAchievements(db, "public");
  const hasGoal = async () =>
    JSON.stringify(await getFeedPage(db, "viewer")).includes('"kind":"goal"');
  await db
    .update(user)
    .set({ journalVisibility: "friends", sendCommentVisibility: "private" })
    .where(eq(user.id, "public"));
  expect(await hasGoal()).toBe(true);
  await db.update(user).set({ journalVisibility: "private" }).where(eq(user.id, "public"));
  expect(await hasGoal()).toBe(false);
  await db
    .update(user)
    .set({ journalVisibility: "friends", isPrivate: true })
    .where(eq(user.id, "public"));
  expect(await hasGoal()).toBe(false);
  await db.update(user).set({ isPrivate: false }).where(eq(user.id, "public"));
  await db.update(friendships).set({ status: "pending" });
  expect(await hasGoal()).toBe(false);
});
