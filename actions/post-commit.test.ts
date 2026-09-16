import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { areas, climbs, friendships, goals, journalEntries, sends, user } from "@/db/schema";
import { seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { setUserPrivate } from "./account";
import { createArea } from "./areas";
import { createClimb } from "./climbs";
import { requestFriendship } from "./friendships";
import { saveGoal } from "./goals";
import { createJournalEntry } from "./journal";
import { createUndatedSend } from "./sends";

vi.mock("next/cache", () => ({
  refresh: vi.fn<() => void>(),
  revalidatePath: vi.fn<() => void>(),
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
vi.mock("@/lib/session", () => ({ requireSession: async () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/rate-limit", () => ({
  allowJournalWrite: async () => true,
  allowFriendshipWrite: async () => true,
}));
vi.mock("@/lib/email", () => ({ sendFriendRequestEmail: async () => {} }));

const db = createDb(env.DB);
const failure = new Error("Cache unavailable after persistence");
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(async () => {
  vi.mocked(refresh).mockReset();
  vi.mocked(revalidatePath).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "owner" });
  await seedFixtureUser(db, { id: "partner" });
});
afterEach(() => vi.restoreAllMocks());

describe.each(["revalidatePath", "refresh"] as const)(
  "a committed mutation when %s fails",
  (operation) => {
    beforeEach(() => {
      vi.mocked(operation === "refresh" ? refresh : revalidatePath).mockImplementation(() => {
        throw failure;
      });
    });

    it("returns a new goal's persisted ID so retry does not duplicate it", async () => {
      const result = await saveGoal(null, {
        kind: "training",
        target: 2,
        discipline: null,
        grade: null,
        timeframe: "month",
        repeat: "none",
        endDate: "2026-09-30",
        timezone: "UTC",
      });
      const stored = await db.select().from(goals);
      expect(stored).toMatchObject([{ userId: "owner", target: 2 }]);
      expect(result).toEqual({ ok: true, value: stored[0].id });
    });

    it("reports a saved journal entry as successful", async () => {
      const result = await createJournalEntry(
        form({ kind: "training", entryDate: "2026-01-01", body: "Hangboard" }),
      );
      expect(await db.select().from(journalEntries)).toMatchObject([
        { userId: "owner", body: "Hangboard" },
      ]);
      expect(result.ok).toBe(true);
    });

    it("reports a saved send as successful", async () => {
      const result = await createUndatedSend(
        form({ climbId: "1", ascentStyle: "flash", suggestedGrade: "5" }),
      );
      expect(await db.select().from(sends)).toMatchObject([
        { userId: "owner", climbId: 1, ascentStyle: "flash" },
      ]);
      expect(result.ok).toBe(true);
    });

    it("reports the saved profile privacy choice", async () => {
      const result = await setUserPrivate(true);
      expect(await db.select().from(user).where(eq(user.id, "owner")).get()).toMatchObject({
        isPrivate: true,
      });
      expect(result.ok).toBe(true);
    });

    it("returns the stored friendship status", async () => {
      const result = await requestFriendship("partner");
      expect(await db.select().from(friendships)).toMatchObject([
        { userId: "owner", friendId: "partner", status: "pending" },
      ]);
      expect(result).toEqual({ ok: true, value: "outgoing" });
    });

    it("returns newly created catalog identities", async () => {
      const areaResult = await createArea(1, form({ name: "New area" }));
      const area = await db.select().from(areas).where(eq(areas.name, "New area")).get();
      expect(area).toMatchObject({ parentId: 1 });
      expect(areaResult).toEqual({ ok: true, value: area!.id });
      const climbResult = await createClimb(
        area!.id,
        form({ name: "New climb", type: "boulder", grade: "5" }),
      );
      const climb = await db.select().from(climbs).where(eq(climbs.name, "New climb")).get();
      expect(climb).toMatchObject({ areaId: area!.id });
      expect(climbResult).toEqual({ ok: true, value: climb!.id });
    });
  },
);
