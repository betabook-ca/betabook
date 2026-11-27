import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestClimbMerge } from "@/actions/moderation";
import { applyClimbBreak } from "@/actions/moderation-apply";
import { createDb } from "@/db/client";
import { adminAreaScopes, changeRequests, climbs, sends } from "@/db/schema";
import { composeClimbBreakTexts } from "@/lib/broken-climbs";
import { seedFixtureSend, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

/** An admin merge applies immediately, with no pending request for an
 * approved break to auto-reject. Between assertClimbMergeable and the merge's
 * own batch, a break can commit — climbUnchanged pins only id/type/area, so
 * the break state needs its own guard clause or the batch would delete a
 * newly broken source, or fold sends into a newly broken target. */

const race = vi.hoisted(() => ({ beforeBatch: undefined as (() => Promise<void>) | undefined }));

vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));
vi.mock("@/lib/email", () => ({ sendChangeRequestDecisionEmail: async () => {} }));
vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ user: { id: "race-admin", role: "admin" } }),
  requireAdmin: async () => ({ user: { id: "race-admin", role: "admin" } }),
  isAdmin: (session: { user: { role?: string | null } }) => session.user.role === "admin",
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return {
    ...actual,
    getDb: async () => {
      const db = actual.createDb(env.DB);
      const batch = db.batch.bind(db);
      db.batch = async (statements) => {
        const beforeBatch = race.beforeBatch;
        race.beforeBatch = undefined;
        await beforeBatch?.();
        return batch(statements);
      };
      return db;
    },
  };
});

const db = createDb(env.DB);

/** Fixture boulders, so either direction merges: Test Highball (area 4) and
 * Test Slab (area 5). */
const SOURCE = 1;
const TARGET = 2;
const STALE_MESSAGE = "The request or affected area/climb changed — reload and try again";

/** Breaks a climb the way an approved report does, on the uninterposed
 * connection, so it commits while the merge is mid-flight. */
async function breakConcurrently(climbId: number) {
  const climb = await db.select().from(climbs).where(eq(climbs.id, climbId)).get();
  if (!climb) throw new Error(`no climb ${climbId}`);
  const input = { brokenOn: "2026-03-05", reason: "Broke during the merge" };
  await applyClimbBreak(
    db,
    climbId,
    { ...input, ...composeClimbBreakTexts(climb, input) },
    { type: "climb_break", entityId: climbId, payload: input, reviewerId: "race-admin" },
  );
}

beforeEach(async () => {
  race.beforeBatch = undefined;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "race-admin", role: "admin" });
  await seedFixtureUser(db, { id: "race-climber" });
  await db.insert(adminAreaScopes).values({ userId: "race-admin", areaId: 1 });
  // One send per climb, dated before any break, so a wrongly committed merge
  // would visibly move or delete history.
  await seedFixtureSend(db, { userId: "race-climber", climbId: SOURCE, dateSent: "2026-01-10" });
  await seedFixtureSend(db, { userId: "race-admin", climbId: TARGET, dateSent: "2026-01-11" });
});

function sendsOn(climbId: number) {
  return db.select().from(sends).where(eq(sends.climbId, climbId));
}

describe("an admin merge racing a break", () => {
  it.each([
    { side: "source", broken: SOURCE },
    { side: "target", broken: TARGET },
  ])("aborts when the $side breaks after the merge was validated", async ({ broken }) => {
    race.beforeBatch = () => breakConcurrently(broken);

    expect(await requestClimbMerge(SOURCE, TARGET)).toEqual({ ok: false, error: STALE_MESSAGE });

    // Neither climb lost its identity or its history.
    const source = await db.select().from(climbs).where(eq(climbs.id, SOURCE)).get();
    expect(source).toBeDefined();
    expect((await sendsOn(SOURCE)).map((row) => row.userId)).toEqual(["race-climber"]);
    expect((await sendsOn(TARGET)).map((row) => row.userId)).toEqual(["race-admin"]);
    expect((await db.select().from(climbs).where(eq(climbs.id, broken)).get())?.brokenOn).toBe(
      "2026-03-05",
    );

    // The break's own audit row is the only merge-adjacent record; no merge
    // was ever recorded as applied.
    expect((await db.select().from(changeRequests)).map((row) => [row.type, row.status])).toEqual([
      ["climb_break", "approved"],
    ]);
  });

  it("still merges when the break lands on an unrelated climb", async () => {
    race.beforeBatch = () => breakConcurrently(4); // Test Crack, untouched by this merge

    expect(await requestClimbMerge(SOURCE, TARGET)).toEqual({
      ok: true,
      value: { status: "applied" },
    });
    expect(await db.select().from(climbs).where(eq(climbs.id, SOURCE)).get()).toBeUndefined();
    expect((await sendsOn(TARGET)).map((row) => row.userId).sort()).toEqual([
      "race-admin",
      "race-climber",
    ]);
  });
});
