import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { tripCompanions } from "@/db/schema";
import { friendshipPair } from "@/lib/friendships";
import {
  seedFixtureFriendship,
  seedFixtureJournalEntry,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureTrip,
  seedFixtureUser,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { canReadTripNotes, getTripForUser, getTripNotes, getTripsForUser } from "./trips";

const db = createDb(env.DB);

const OWNER = "owner";
const STRANGER = "stranger";
const CLIMB = 1;
const OTHER_CLIMB = 2;

const BISHOP = { startDate: "2026-03-10", endDate: "2026-03-20" };

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: OWNER, name: "Trip Owner" });
  await seedFixtureUser(db, { id: STRANGER, name: "Passing Climber" });
});

describe("what a trip contains", () => {
  it("counts only the entries and sends dated inside the window", async () => {
    const trip = await seedFixtureTrip(db, { userId: OWNER, name: "Bishop", ...BISHOP });

    // Inside, including both boundary days.
    await seedFixtureJournalEntry(db, { userId: OWNER, climbId: CLIMB, entryDate: "2026-03-10" });
    await seedFixtureJournalEntry(db, { userId: OWNER, climbId: CLIMB, entryDate: "2026-03-15" });
    await seedFixtureJournalEntry(db, { userId: OWNER, climbId: CLIMB, entryDate: "2026-03-20" });
    await seedFixtureSend(db, { userId: OWNER, climbId: CLIMB, dateSent: "2026-03-15" });
    // The day either side, which must not be pulled in.
    await seedFixtureJournalEntry(db, { userId: OWNER, climbId: CLIMB, entryDate: "2026-03-09" });
    await seedFixtureJournalEntry(db, { userId: OWNER, climbId: CLIMB, entryDate: "2026-03-21" });
    await seedFixtureSend(db, { userId: OWNER, climbId: OTHER_CLIMB, dateSent: "2026-03-21" });

    const [summary] = await getTripsForUser(db, OWNER, OWNER);
    expect(summary).toMatchObject({
      id: trip.id,
      name: "Bishop",
      startDate: "2026-03-10",
      endDate: "2026-03-20",
      entryCount: 3,
      sendCount: 1,
    });
  });

  it("never counts an undated send, which cannot be shown to fall inside", async () => {
    await seedFixtureTrip(db, { userId: OWNER, ...BISHOP });
    await seedFixtureSend(db, { userId: OWNER, climbId: CLIMB, dateSent: null });

    const [summary] = await getTripsForUser(db, OWNER, OWNER);
    expect(summary.sendCount).toBe(0);
  });

  it("counts training entries too, because the trip's journal tab lists them", async () => {
    await seedFixtureTrip(db, { userId: OWNER, ...BISHOP });
    await seedFixtureJournalEntry(db, { userId: OWNER, climbId: CLIMB, entryDate: "2026-03-12" });
    await seedFixtureJournalEntry(db, {
      userId: OWNER,
      kind: "training",
      climbId: null,
      entryDate: "2026-03-13",
    });

    const [summary] = await getTripsForUser(db, OWNER, OWNER);
    expect(summary.entryCount).toBe(2);
  });

  it("counts days logged as distinct dates with an entry, not the length of the window", async () => {
    await seedFixtureTrip(db, { userId: OWNER, ...BISHOP });
    await seedFixtureJournalEntry(db, { userId: OWNER, climbId: CLIMB, entryDate: "2026-03-12" });
    await seedFixtureJournalEntry(db, {
      userId: OWNER,
      climbId: OTHER_CLIMB,
      entryDate: "2026-03-12",
    });
    await seedFixtureJournalEntry(db, { userId: OWNER, climbId: CLIMB, entryDate: "2026-03-14" });

    const [summary] = await getTripsForUser(db, OWNER, OWNER);
    expect(summary).toMatchObject({ entryCount: 3, dayCount: 2 });
  });

  it("counts a one-day trip's own day", async () => {
    await seedFixtureTrip(db, {
      userId: OWNER,
      startDate: "2026-03-10",
      endDate: "2026-03-10",
    });
    await seedFixtureJournalEntry(db, { userId: OWNER, climbId: CLIMB, entryDate: "2026-03-10" });

    const [summary] = await getTripsForUser(db, OWNER, OWNER);
    expect(summary).toMatchObject({ entryCount: 1, dayCount: 1 });
  });

  it("lets overlapping trips both contain the same day, since a trip owns nothing", async () => {
    await seedFixtureTrip(db, { userId: OWNER, name: "Bishop", ...BISHOP });
    await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Spring road trip",
      startDate: "2026-03-01",
      endDate: "2026-04-30",
    });
    await seedFixtureJournalEntry(db, { userId: OWNER, climbId: CLIMB, entryDate: "2026-03-15" });

    const trips = await getTripsForUser(db, OWNER, OWNER);
    expect(trips.map((trip) => [trip.name, trip.entryCount])).toEqual([
      ["Bishop", 1],
      ["Spring road trip", 1],
    ]);
  });

  it("ignores another climber's entries inside the same dates", async () => {
    await seedFixtureTrip(db, { userId: OWNER, ...BISHOP });
    await seedFixtureJournalEntry(db, {
      userId: STRANGER,
      climbId: CLIMB,
      entryDate: "2026-03-15",
    });
    await seedFixtureSend(db, { userId: STRANGER, climbId: CLIMB, dateSent: "2026-03-15" });

    const [summary] = await getTripsForUser(db, OWNER, OWNER);
    expect(summary).toMatchObject({ entryCount: 0, sendCount: 0 });
  });
});

describe("who was on a trip", () => {
  const PARTNER = "partner";

  async function seedTaggedTrip() {
    const trip = await seedFixtureTrip(db, { userId: OWNER, name: "Bishop", ...BISHOP });
    await seedFixtureUser(db, { id: PARTNER, name: "Climbing Partner" });
    await seedFixtureFriendship(db, OWNER, PARTNER);
    await db.insert(tripCompanions).values({
      tripId: trip.id,
      userId: PARTNER,
      friendshipUserId: friendshipPair(OWNER, PARTNER).userId,
      friendshipFriendId: friendshipPair(OWNER, PARTNER).friendId,
    });
    return trip;
  }

  it("names the tagged friends to whoever can read the journal, and marks the reader's own tag", async () => {
    const trip = await seedTaggedTrip();

    const [asOwner] = await getTripsForUser(db, OWNER, OWNER);
    expect(asOwner.companions).toEqual([
      { id: PARTNER, name: "Climbing Partner", image: null, isSelf: false },
    ]);

    const asPartner = await getTripForUser(db, OWNER, trip.id, PARTNER);
    expect(asPartner?.companions).toEqual([
      { id: PARTNER, name: "Climbing Partner", image: null, isSelf: true },
    ]);
  });

  it("names nobody to a reader the journal is not shared with", async () => {
    const trip = await seedTaggedTrip();

    // A member outside the default Friends audience still opens the trip.
    const asMember = await getTripForUser(db, OWNER, trip.id, STRANGER);
    expect(asMember).toMatchObject({ name: "Bishop", companions: [] });
  });

  it("drops a tag its friend removed, and one whose friendship ended", async () => {
    const trip = await seedTaggedTrip();
    await db.update(tripCompanions).set({ suppressed: true });
    expect((await getTripForUser(db, OWNER, trip.id, OWNER))?.companions).toEqual([]);

    await db.run(sql`DELETE FROM trip_companions`);
    const other = await seedTaggedTripFriend(trip.id);
    expect((await getTripForUser(db, OWNER, trip.id, OWNER))?.companions).toHaveLength(1);
    await db.run(
      sql`UPDATE friendships SET status = 'pending' WHERE friend_id = ${other} OR user_id = ${other}`,
    );
    expect((await getTripForUser(db, OWNER, trip.id, OWNER))?.companions).toEqual([]);
  });

  async function seedTaggedTripFriend(tripId: number) {
    const id = "second";
    await seedFixtureUser(db, { id, name: "Second Partner" });
    await seedFixtureFriendship(db, OWNER, id);
    await db.insert(tripCompanions).values({
      tripId,
      userId: id,
      friendshipUserId: friendshipPair(OWNER, id).userId,
      friendshipFriendId: friendshipPair(OWNER, id).friendId,
    });
    return id;
  }
});

describe("who can read a trip", () => {
  const FRIEND = "friend";
  const NOTES = "Camped at the Pit.";

  async function seedBishop() {
    const trip = await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Bishop",
      notes: NOTES,
      ...BISHOP,
    });
    await seedFixtureJournalEntry(db, { userId: OWNER, climbId: CLIMB, entryDate: "2026-03-15" });
    await seedFixtureSend(db, { userId: OWNER, climbId: CLIMB, dateSent: "2026-03-15" });
    await seedFixtureUser(db, { id: FRIEND, name: "Climbing Partner" });
    await seedFixtureFriendship(db, OWNER, FRIEND);
    return trip;
  }

  function audience(journalVisibility: "private" | "friends" | "public") {
    return db.run(
      sql`UPDATE user SET journal_visibility = ${journalVisibility} WHERE id = ${OWNER}`,
    );
  }

  it("lists each climber's own trips and nobody else's", async () => {
    await seedFixtureTrip(db, { userId: OWNER, name: "Bishop", ...BISHOP });
    await seedFixtureTrip(db, { userId: STRANGER, name: "Squamish", ...BISHOP });

    expect((await getTripsForUser(db, OWNER, OWNER)).map((trip) => trip.name)).toEqual(["Bishop"]);
    expect((await getTripsForUser(db, STRANGER, OWNER)).map((trip) => trip.name)).toEqual([
      "Squamish",
    ]);
  });

  it("shows a member the trip and its sends, and the journal's counts only with the journal", async () => {
    const trip = await seedBishop();
    await audience("friends");

    const [asMember] = await getTripsForUser(db, OWNER, STRANGER);
    expect(asMember).toMatchObject({
      id: trip.id,
      name: "Bishop",
      sendCount: 1,
      entryCount: null,
      dayCount: null,
    });
    expect(await getTripForUser(db, OWNER, trip.id, STRANGER)).toEqual(asMember);

    const [asFriend] = await getTripsForUser(db, OWNER, FRIEND);
    expect(asFriend).toMatchObject({ sendCount: 1, entryCount: 1, dayCount: 1 });
  });

  it("follows the journal audience as it stands now", async () => {
    const trip = await seedBishop();

    await audience("public");
    expect((await getTripForUser(db, OWNER, trip.id, STRANGER))?.entryCount).toBe(1);

    await audience("private");
    expect((await getTripForUser(db, OWNER, trip.id, FRIEND))?.entryCount).toBeNull();
    expect((await getTripForUser(db, OWNER, trip.id, OWNER))?.entryCount).toBe(1);
  });

  it("hides a private climber's trips from everyone but them", async () => {
    const trip = await seedBishop();
    await db.run(sql`UPDATE user SET is_private = 1 WHERE id = ${OWNER}`);

    expect(await getTripsForUser(db, OWNER, FRIEND)).toEqual([]);
    expect(await getTripForUser(db, OWNER, trip.id, FRIEND)).toBeNull();
    expect(await getTripsForUser(db, OWNER, OWNER)).toHaveLength(1);
  });

  it("does not resolve a trip through another climber's id", async () => {
    const trip = await seedBishop();

    expect(await getTripForUser(db, STRANGER, trip.id, STRANGER)).toBeNull();
    expect(await getTripForUser(db, OWNER, trip.id, OWNER)).toMatchObject({ id: trip.id });
  });

  it("hands the album's link to whoever can open the trip", async () => {
    const album = "https://photos.app.goo.gl/Example1Album2Link3";
    const trip = await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Bishop",
      albumUrl: album,
      ...BISHOP,
    });
    await audience("private");

    for (const reader of [OWNER, STRANGER, null]) {
      expect((await getTripForUser(db, OWNER, trip.id, reader))?.albumUrl).toBe(album);
      expect((await getTripsForUser(db, OWNER, reader))[0].albumUrl).toBe(album);
    }

    await db.run(sql`UPDATE user SET is_private = 1 WHERE id = ${OWNER}`);
    expect(await getTripForUser(db, OWNER, trip.id, STRANGER)).toBeNull();
    expect((await getTripForUser(db, OWNER, trip.id, OWNER))?.albumUrl).toBe(album);
  });

  it("hands the notes to the climber's friends, whatever the journal's audience", async () => {
    const trip = await seedBishop();

    for (const journal of ["private", "friends", "public"] as const) {
      await audience(journal);

      expect(await getTripNotes(db, OWNER, trip.id, OWNER)).toBe(NOTES);
      expect(await getTripNotes(db, OWNER, trip.id, FRIEND)).toBe(NOTES);
      expect(await getTripNotes(db, OWNER, trip.id, STRANGER)).toBeNull();
      expect(await getTripNotes(db, OWNER, trip.id, null)).toBeNull();

      // The tab is offered on the same terms as the notes behind it.
      expect((await getTripForUser(db, OWNER, trip.id, FRIEND))?.hasNotes).toBe(1);
      expect((await getTripForUser(db, OWNER, trip.id, STRANGER))?.hasNotes).toBe(0);
      expect((await getTripForUser(db, OWNER, trip.id, null))?.hasNotes).toBe(0);
    }
  });

  it("keeps the notes from a request that was never accepted, and from a friend once the profile is private", async () => {
    const trip = await seedBishop();
    await seedFixtureUser(db, { id: "asked", name: "Still Waiting" });
    await seedFixtureFriendship(db, "asked", OWNER, "pending");

    expect(await getTripNotes(db, OWNER, trip.id, "asked")).toBeNull();
    expect((await getTripForUser(db, OWNER, trip.id, "asked"))?.hasNotes).toBe(0);

    await db.run(sql`UPDATE user SET is_private = 1 WHERE id = ${OWNER}`);
    expect(await getTripNotes(db, OWNER, trip.id, FRIEND)).toBeNull();
    expect(await getTripNotes(db, OWNER, trip.id, OWNER)).toBe(NOTES);
  });

  it("says whether a reader is among the friends the notes are for", async () => {
    await seedBishop();
    await audience("private");

    expect(await canReadTripNotes(db, OWNER, OWNER)).toBe(true);
    expect(await canReadTripNotes(db, OWNER, FRIEND)).toBe(true);
    expect(await canReadTripNotes(db, OWNER, STRANGER)).toBe(false);
    expect(await canReadTripNotes(db, OWNER, null)).toBe(false);
  });
});

describe("ordering", () => {
  it("leads with the most recent window and keeps same-day trips stable", async () => {
    const first = await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Same day A",
      startDate: "2026-03-01",
      endDate: "2026-03-02",
    });
    const second = await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Same day B",
      startDate: "2026-03-01",
      endDate: "2026-03-02",
    });
    await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Later",
      startDate: "2026-06-01",
      endDate: "2026-06-10",
    });
    await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Earlier",
      startDate: "2026-01-01",
      endDate: "2026-01-10",
    });

    expect((await getTripsForUser(db, OWNER, OWNER)).map((trip) => trip.name)).toEqual([
      "Later",
      "Same day B",
      "Same day A",
      "Earlier",
    ]);
    expect(second.id).toBeGreaterThan(first.id);
  });
});

describe("what the database itself refuses", () => {
  // The CHECK constraints are the backstop under the action's own validation,
  // so these assert the write is refused at the database — not the wording,
  // which drizzle wraps, but that no row survives the attempt.
  it("rejects a window that ends before it starts", async () => {
    await expect(
      seedFixtureTrip(db, { userId: OWNER, startDate: "2026-03-20", endDate: "2026-03-10" }),
    ).rejects.toThrow(/Failed query/);
    expect(await getTripsForUser(db, OWNER, OWNER)).toHaveLength(0);
  });

  it("rejects a blank name", async () => {
    await expect(seedFixtureTrip(db, { userId: OWNER, name: "   ", ...BISHOP })).rejects.toThrow(
      /Failed query/,
    );
    expect(await getTripsForUser(db, OWNER, OWNER)).toHaveLength(0);
  });

  it("takes the trip with the account, leaving no orphan window", async () => {
    await seedFixtureTrip(db, { userId: STRANGER, ...BISHOP });
    expect(await getTripsForUser(db, STRANGER, STRANGER)).toHaveLength(1);

    // Deleting the user cascades; the trip must not survive it.
    await db.run(sql`DELETE FROM user WHERE id = ${STRANGER}`);
    expect(await getTripsForUser(db, STRANGER, STRANGER)).toHaveLength(0);
  });
});
