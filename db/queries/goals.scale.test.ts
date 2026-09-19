import { env } from "cloudflare:test";
import { expect, it } from "vitest";

import { createDb } from "@/db/client";
import { goals } from "@/db/schema";
import { insertInBatches, seedFixtureUser, seedManyJournalEntries } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getGoalOverview, getGoalPage, refreshGoalAchievements } from "./goals";

it("reconciles five routines and 100 archived goals over 5,000 tagged logs", async () => {
  const archived = 100;
  const db = createDb(env.DB);
  await resetDb(db);
  await seedFixtureUser(db, { id: "goal-scale" });
  await seedManyJournalEntries(
    db,
    Array.from({ length: 5000 }, (_, i) => ({
      userId: "goal-scale",
      kind: "training" as const,
      entryDate: new Date(Date.UTC(2023, 0, 1 + (i % 1350))).toISOString().slice(0, 10),
      tags: i % 2 ? ["strength"] : ["strength", "hangboard"],
    })),
  );
  const definition = {
    userId: "goal-scale",
    kind: "training" as const,
    target: 20,
    timeframe: "month" as const,
    repeat: "month" as const,
    startDate: "2023-01-01",
    endDate: "2023-01-31",
    timezone: "UTC",
    tags: ["hangboard", "strength"],
    celebrationsInitialized: true,
  };
  await db.insert(goals).values(Array.from({ length: 5 }, () => definition));
  await insertInBatches(
    db,
    Array.from({ length: archived }, (_, i) => ({
      ...definition,
      target: 1,
      repeat: "none" as const,
      timeframe: "custom" as const,
      endDate: "2026-09-15",
      archiveToken: `archived-${i}`,
    })),
    5,
    (chunk) => db.insert(goals).values(chunk),
  );
  const now = new Date("2026-09-15T12:00:00Z");
  await refreshGoalAchievements(db, "goal-scale", now);
  const overview = await getGoalOverview(db, "goal-scale", "goal-scale", now);
  expect(overview.active.goals).toHaveLength(5);
  expect(overview.completed.total).toBe(5);
  expect(overview.completed.goals).toHaveLength(5);
  expect((await getGoalPage(db, "goal-scale", "goal-scale", "completed", 0, now, 2023)).total).toBe(
    archived + 5,
  );
}, 30000);
