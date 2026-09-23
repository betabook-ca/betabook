import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteTrip, saveTrip } from "@/actions";
import { createDb } from "@/db/client";
import { getTripsForOwner } from "@/db/queries";
import { trips } from "@/db/schema";
import { MAX_TRIPS } from "@/lib/trips";
import {
  insertInBatches,
  seedFixtureTrip,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const identity = vi.hoisted(() => ({ id: "climber" as string | null }));
const limits = vi.hoisted(() => ({ allow: true }));
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
vi.mock("@/lib/rate-limit", () => ({ allowJournalWrite: async () => limits.allow }));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

const db = createDb(env.DB);

const BISHOP = {
  name: "Bishop",
  description: "Buttermilks",
  startDate: "2026-03-10",
  endDate: "2026-03-20",
};

async function storedTrips(userId = "climber") {
  return db.select().from(trips).where(eq(trips.userId, userId));
}

/** Reads one row back by id, whoever owns it — so an assertion that another
 * climber's trip survived a refused write does not depend on the same owner
 * scope the write was supposed to apply. */
async function storedTripById(id: number) {
  const [row] = await db.select().from(trips).where(eq(trips.id, id));
  return row ?? null;
}

beforeEach(async () => {
  identity.id = "climber";
  limits.allow = true;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "climber", name: "Travelling Climber" });
  await seedFixtureUser(db, { id: "other", name: "Other Climber" });
});

describe("creating a trip", () => {
  it("stores the window and returns the new id", async () => {
    const result = await saveTrip(null, BISHOP);
    expect(result.ok).toBe(true);

    const stored = await storedTrips();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      userId: "climber",
      name: "Bishop",
      description: "Buttermilks",
      startDate: "2026-03-10",
      endDate: "2026-03-20",
    });
    expect(result.ok && result.value).toBe(stored[0].id);
  });

  it("refuses a window that ends before it starts, and writes nothing", async () => {
    const result = await saveTrip(null, {
      ...BISHOP,
      startDate: "2026-03-20",
      endDate: "2026-03-10",
    });
    expect(result).toMatchObject({ ok: false, error: "End date must be on or after start date." });
    expect(await storedTrips()).toHaveLength(0);
  });

  it("refuses a blank name, and writes nothing", async () => {
    const result = await saveTrip(null, { ...BISHOP, name: "   " });
    expect(result.ok).toBe(false);
    expect(await storedTrips()).toHaveLength(0);
  });

  it("refuses an impossible calendar date, and writes nothing", async () => {
    const result = await saveTrip(null, { ...BISHOP, startDate: "2026-02-30" });
    expect(result).toMatchObject({ ok: false, error: "Choose a valid date." });
    expect(await storedTrips()).toHaveLength(0);
  });

  it("refuses to write for a signed-out caller", async () => {
    identity.id = null;
    const result = await saveTrip(null, BISHOP);
    expect(result.ok).toBe(false);
    expect(await storedTrips()).toHaveLength(0);
  });

  it("refuses once the rate limiter says no", async () => {
    limits.allow = false;
    const result = await saveTrip(null, BISHOP);
    expect(result).toMatchObject({ ok: false, error: "Too many changes — try again in a minute" });
    expect(await storedTrips()).toHaveLength(0);
  });

  it("stops at the cap rather than letting the table grow without bound", async () => {
    // Four bound parameters per row, and D1 caps a statement at 100.
    await insertInBatches(
      db,
      Array.from({ length: MAX_TRIPS }, (_unused, index) => ({
        userId: "climber",
        name: `Trip ${index}`,
        startDate: "2026-01-01",
        endDate: "2026-01-02",
      })),
      20,
      (chunk) => db.insert(trips).values(chunk),
    );

    const result = await saveTrip(null, BISHOP);
    expect(result.ok).toBe(false);
    expect(await storedTrips()).toHaveLength(MAX_TRIPS);
  });
});

describe("editing a trip", () => {
  it("moves the window without touching anything dated inside it", async () => {
    const created = await saveTrip(null, BISHOP);
    const id = created.ok ? created.value : 0;

    const result = await saveTrip(id, {
      ...BISHOP,
      name: "Bishop, take two",
      endDate: "2026-03-25",
    });
    expect(result.ok).toBe(true);

    expect(await storedTripById(id)).toMatchObject({
      name: "Bishop, take two",
      startDate: "2026-03-10",
      endDate: "2026-03-25",
    });
    expect(await storedTrips()).toHaveLength(1);
  });

  it("clears a description that is emptied", async () => {
    const created = await saveTrip(null, BISHOP);
    const id = created.ok ? created.value : 0;

    await saveTrip(id, { ...BISHOP, description: "  " });
    expect(await storedTripById(id)).toMatchObject({ description: null });
  });

  it("moves updated_at forward, so the column does not quietly lie", async () => {
    const created = await saveTrip(null, BISHOP);
    const id = created.ok ? created.value : 0;

    // Pinned to a known past value rather than compared against `created_at`:
    // both default to the same millisecond expression, so a same-tick edit
    // would make an untouched column look updated.
    await db.run(sql`UPDATE trips SET updated_at = 0 WHERE id = ${id}`);

    await saveTrip(id, { ...BISHOP, name: "Bishop, take two" });

    const [stored] = await storedTrips();
    expect(stored.updatedAt.getTime()).toBeGreaterThan(0);
  });

  it("refuses to edit another climber's trip, and leaves it unchanged", async () => {
    const theirs = await seedFixtureTrip(db, {
      userId: "other",
      name: "Squamish",
      startDate: "2026-05-01",
      endDate: "2026-05-10",
    });

    const result = await saveTrip(theirs.id, BISHOP);
    expect(result).toMatchObject({ ok: false, error: "Trip not found" });
    expect(await storedTripById(theirs.id)).toMatchObject({
      name: "Squamish",
      startDate: "2026-05-01",
      endDate: "2026-05-10",
    });
  });

  it("reads an id that never existed the same way as someone else's", async () => {
    expect(await saveTrip(9999, BISHOP)).toMatchObject({ ok: false, error: "Trip not found" });
    expect(await saveTrip(-1, BISHOP)).toMatchObject({ ok: false, error: "Trip not found" });
  });
});

describe("deleting a trip", () => {
  it("removes the window and nothing else", async () => {
    const created = await saveTrip(null, BISHOP);
    const id = created.ok ? created.value : 0;

    expect((await deleteTrip(id)).ok).toBe(true);
    expect(await getTripsForOwner(db, "climber")).toHaveLength(0);
  });

  it("refuses to delete another climber's trip", async () => {
    const theirs = await seedFixtureTrip(db, {
      userId: "other",
      name: "Squamish",
      startDate: "2026-05-01",
      endDate: "2026-05-10",
    });

    await deleteTrip(theirs.id);
    expect(await getTripsForOwner(db, "other")).toHaveLength(1);
  });

  it("treats deleting a trip that is already gone as the end state it asked for", async () => {
    expect((await deleteTrip(9999)).ok).toBe(true);
  });

  it("refuses to delete for a signed-out caller", async () => {
    const created = await saveTrip(null, BISHOP);
    const id = created.ok ? created.value : 0;

    identity.id = null;
    expect((await deleteTrip(id)).ok).toBe(false);
    expect(await getTripsForOwner(db, "climber")).toHaveLength(1);
  });
});
