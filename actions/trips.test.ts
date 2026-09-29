import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteTrip, removeMyTripTag, saveTrip, saveTripNotes } from "@/actions";
import { createDb } from "@/db/client";
import { getTripNotes, getTripsForUser } from "@/db/queries";
import { tripCompanions, trips } from "@/db/schema";
import { friendshipPair } from "@/lib/friendships";
import { MAX_TRIP_DESCRIPTION, MAX_TRIP_NOTES, MAX_TRIPS } from "@/lib/trips";
import {
  insertInBatches,
  seedFixtureFriendship,
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

  it("keeps the description to one line of one summary's length", async () => {
    const created = await saveTrip(null, {
      ...BISHOP,
      description: "  Buttermilks\nand \t the Happies.\n\n",
    });
    const id = created.ok ? created.value : 0;
    expect(await storedTripById(id)).toMatchObject({
      description: "Buttermilks and the Happies.",
    });

    expect(
      await saveTrip(id, { ...BISHOP, description: "a".repeat(MAX_TRIP_DESCRIPTION + 1) }),
    ).toMatchObject({ ok: false, error: "That description is too long." });
    expect(await storedTripById(id)).toMatchObject({
      description: "Buttermilks and the Happies.",
    });

    expect(MAX_TRIP_DESCRIPTION).toBeLessThanOrEqual(200);
    const longest = "a".repeat(MAX_TRIP_DESCRIPTION);
    expect((await saveTrip(id, { ...BISHOP, description: longest })).ok).toBe(true);
    expect(await storedTripById(id)).toMatchObject({ description: longest });
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
    expect(await getTripsForUser(db, "climber", "climber")).toHaveLength(0);
  });

  it("refuses to delete another climber's trip", async () => {
    const theirs = await seedFixtureTrip(db, {
      userId: "other",
      name: "Squamish",
      startDate: "2026-05-01",
      endDate: "2026-05-10",
    });

    await deleteTrip(theirs.id);
    expect(await getTripsForUser(db, "other", "other")).toHaveLength(1);
  });

  it("treats deleting a trip that is already gone as the end state it asked for", async () => {
    expect((await deleteTrip(9999)).ok).toBe(true);
  });

  it("refuses to delete for a signed-out caller", async () => {
    const created = await saveTrip(null, BISHOP);
    const id = created.ok ? created.value : 0;

    identity.id = null;
    expect((await deleteTrip(id)).ok).toBe(false);
    expect(await getTripsForUser(db, "climber", "climber")).toHaveLength(1);
  });
});

describe("writing trip notes", () => {
  const NOTES = "# Day one\n\n**Sent** the project.";

  async function bishop() {
    const created = await saveTrip(null, BISHOP);
    return created.ok ? created.value : 0;
  }

  it("stores the notes as written and leaves the trip's own fields alone", async () => {
    const id = await bishop();

    expect((await saveTripNotes(id, `  ${NOTES}\n`)).ok).toBe(true);

    expect(await storedTripById(id)).toMatchObject({
      notes: NOTES,
      name: "Bishop",
      description: "Buttermilks",
      startDate: "2026-03-10",
      endDate: "2026-03-20",
    });
    expect(await getTripNotes(db, "climber", id, "climber")).toBe(NOTES);
  });

  it("keeps the notes when the trip's own fields are edited", async () => {
    const id = await bishop();
    await saveTripNotes(id, NOTES);

    await saveTrip(id, { ...BISHOP, name: "Bishop, take two", description: "" });

    expect(await storedTripById(id)).toMatchObject({ name: "Bishop, take two", notes: NOTES });
  });

  it("clears notes that are emptied", async () => {
    const id = await bishop();
    await saveTripNotes(id, NOTES);

    expect((await saveTripNotes(id, " \n ")).ok).toBe(true);
    expect(await storedTripById(id)).toMatchObject({ notes: null });
  });

  it("refuses notes past the limit, and keeps what was stored", async () => {
    const id = await bishop();
    await saveTripNotes(id, NOTES);

    const result = await saveTripNotes(id, "a".repeat(MAX_TRIP_NOTES + 1));
    expect(result).toMatchObject({ ok: false, error: "Those notes are too long." });
    expect(await storedTripById(id)).toMatchObject({ notes: NOTES });

    expect((await saveTripNotes(id, "a".repeat(MAX_TRIP_NOTES))).ok).toBe(true);
  });

  it("refuses anything that is not text", async () => {
    const id = await bishop();
    expect((await saveTripNotes(id, { notes: NOTES })).ok).toBe(false);
    expect(await storedTripById(id)).toMatchObject({ notes: null });
  });

  it("moves updated_at forward", async () => {
    const id = await bishop();
    await db.run(sql`UPDATE trips SET updated_at = 0 WHERE id = ${id}`);

    await saveTripNotes(id, NOTES);

    const [stored] = await storedTrips();
    expect(stored.updatedAt.getTime()).toBeGreaterThan(0);
  });

  it("refuses to write on another climber's trip, and leaves it unchanged", async () => {
    const theirs = await seedFixtureTrip(db, {
      userId: "other",
      name: "Squamish",
      startDate: "2026-05-01",
      endDate: "2026-05-10",
      notes: "Theirs.",
    });

    expect(await saveTripNotes(theirs.id, NOTES)).toMatchObject({
      ok: false,
      error: "Trip not found",
    });
    expect(await storedTripById(theirs.id)).toMatchObject({ notes: "Theirs." });
    expect(await getTripNotes(db, "climber", theirs.id, "climber")).toBeNull();
    expect(await getTripNotes(db, "other", theirs.id, "other")).toBe("Theirs.");
  });

  it("refuses for a signed-out caller and once the rate limiter says no", async () => {
    const id = await bishop();

    limits.allow = false;
    expect((await saveTripNotes(id, NOTES)).ok).toBe(false);
    limits.allow = true;
    identity.id = null;
    expect((await saveTripNotes(id, NOTES)).ok).toBe(false);

    expect(await storedTripById(id)).toMatchObject({ notes: null });
  });
});

describe("tagging friends on a trip", () => {
  const UNAVAILABLE =
    "A selected friend is no longer available for this trip. Refresh and update your tagged friends.";

  function tagged(tripId: number) {
    return db
      .select({ userId: tripCompanions.userId, suppressed: tripCompanions.suppressed })
      .from(tripCompanions)
      .where(eq(tripCompanions.tripId, tripId))
      .orderBy(tripCompanions.userId);
  }

  beforeEach(async () => {
    for (const id of ["priya", "sam"]) {
      await seedFixtureUser(db, { id, name: `Friend ${id}` });
      await seedFixtureFriendship(db, "climber", id);
    }
    await seedFixtureUser(db, { id: "asked", name: "Not Yet A Friend" });
    await seedFixtureFriendship(db, "climber", "asked", "pending");
  });

  it("tags the chosen friends on a new trip", async () => {
    const result = await saveTrip(null, { ...BISHOP, companions: ["sam", "priya", "sam"] });
    const id = result.ok ? result.value : 0;

    expect(await tagged(id)).toEqual([
      { userId: "priya", suppressed: false },
      { userId: "sam", suppressed: false },
    ]);
    const [trip] = await getTripsForUser(db, "climber", "climber");
    expect(trip.companions.map((friend) => friend.name)).toEqual(["Friend priya", "Friend sam"]);
  });

  it("replaces the tags it is sent, and leaves them alone when it is sent none", async () => {
    const created = await saveTrip(null, { ...BISHOP, companions: ["sam"] });
    const id = created.ok ? created.value : 0;

    expect((await saveTrip(id, { ...BISHOP, companions: ["priya"] })).ok).toBe(true);
    expect(await tagged(id)).toEqual([{ userId: "priya", suppressed: false }]);

    // The trip dialog sends no selection unless the climber changed it.
    expect((await saveTrip(id, { ...BISHOP, name: "Bishop, take two" })).ok).toBe(true);
    expect(await tagged(id)).toEqual([{ userId: "priya", suppressed: false }]);

    expect((await saveTrip(id, { ...BISHOP, companions: [] })).ok).toBe(true);
    expect(await tagged(id)).toEqual([]);
  });

  it.each(["other", "asked", "climber", "nobody"])(
    "refuses %s as a companion, and writes no trip",
    async (friend) => {
      const result = await saveTrip(null, { ...BISHOP, companions: ["sam", friend] });

      expect(result).toMatchObject({ ok: false, error: UNAVAILABLE });
      expect(await storedTrips()).toEqual([]);
      expect(await db.select().from(tripCompanions)).toEqual([]);
    },
  );

  it("refuses an edit that tags someone unavailable, and keeps the trip as it was", async () => {
    const created = await saveTrip(null, { ...BISHOP, companions: ["sam"] });
    const id = created.ok ? created.value : 0;

    const result = await saveTrip(id, { ...BISHOP, name: "Renamed", companions: ["other"] });

    expect(result).toMatchObject({ ok: false, error: UNAVAILABLE });
    expect(await storedTripById(id)).toMatchObject({ name: "Bishop" });
    expect(await tagged(id)).toEqual([{ userId: "sam", suppressed: false }]);
  });

  it("refuses more than ten friends and anything that is not a list of ids", async () => {
    const eleven = Array.from({ length: 11 }, (_unused, index) => `friend-${index}`);

    expect(await saveTrip(null, { ...BISHOP, companions: eleven })).toMatchObject({
      ok: false,
      error: "Choose at most 10 friends",
    });
    expect((await saveTrip(null, { ...BISHOP, companions: "sam" })).ok).toBe(false);
    expect((await saveTrip(null, { ...BISHOP, companions: [""] })).ok).toBe(false);
    expect(await storedTrips()).toEqual([]);
  });

  it("tags nothing when the trip limit refuses the trip", async () => {
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

    const result = await saveTrip(null, { ...BISHOP, companions: ["sam"] });

    expect(result.ok).toBe(false);
    expect(await storedTrips()).toHaveLength(MAX_TRIPS);
    // The last row this connection inserted is one of the climber's own trips,
    // which is exactly where a stale insert id would have put the tag.
    expect(await db.select().from(tripCompanions)).toEqual([]);
  });

  it("never touches the tags on another climber's trip", async () => {
    await seedFixtureFriendship(db, "other", "sam");
    const theirs = await seedFixtureTrip(db, {
      userId: "other",
      name: "Squamish",
      startDate: "2026-05-01",
      endDate: "2026-05-10",
    });
    const pair = friendshipPair("other", "sam");
    await db.insert(tripCompanions).values({
      tripId: theirs.id,
      userId: "sam",
      friendshipUserId: pair.userId,
      friendshipFriendId: pair.friendId,
    });

    for (const companions of [[], ["priya"]]) {
      expect(await saveTrip(theirs.id, { ...BISHOP, companions })).toMatchObject({ ok: false });
      expect(await tagged(theirs.id)).toEqual([{ userId: "sam", suppressed: false }]);
    }
    expect(await storedTripById(theirs.id)).toMatchObject({ name: "Squamish" });
  });

  describe("removing your own tag", () => {
    async function taggedTrip() {
      const created = await saveTrip(null, { ...BISHOP, companions: ["sam", "priya"] });
      return created.ok ? created.value : 0;
    }

    it("takes the friend off the trip and keeps them off", async () => {
      const id = await taggedTrip();

      identity.id = "sam";
      expect((await removeMyTripTag(id)).ok).toBe(true);
      expect(await tagged(id)).toEqual([
        { userId: "priya", suppressed: false },
        { userId: "sam", suppressed: true },
      ]);

      identity.id = "climber";
      const [trip] = await getTripsForUser(db, "climber", "climber");
      expect(trip.companions.map((friend) => friend.id)).toEqual(["priya"]);
      expect(await saveTrip(id, { ...BISHOP, companions: ["sam", "priya"] })).toMatchObject({
        ok: false,
        error: UNAVAILABLE,
      });
      // Saving the rest of the selection still works.
      expect((await saveTrip(id, { ...BISHOP, companions: ["priya"] })).ok).toBe(true);
    });

    it("refuses anyone who is not tagged, and a reader the journal is closed to", async () => {
      const id = await taggedTrip();

      identity.id = "other";
      expect(await removeMyTripTag(id)).toMatchObject({
        ok: false,
        error: "This tag is no longer available",
      });

      await db.run(sql`UPDATE user SET journal_visibility = 'private' WHERE id = 'climber'`);
      identity.id = "sam";
      expect((await removeMyTripTag(id)).ok).toBe(false);

      identity.id = null;
      expect((await removeMyTripTag(id)).ok).toBe(false);
      expect(await tagged(id)).toEqual([
        { userId: "priya", suppressed: false },
        { userId: "sam", suppressed: false },
      ]);
    });
  });
});
