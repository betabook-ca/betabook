import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/db/client";
import {
  journalEntries,
  journalCompanions,
  tripCompanions,
  tripShareLinks,
  trips,
} from "@/db/schema";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";
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

import { getJournalPage, getSharedTripAnalyticsSessions, getSharedTripEntries } from "./journal";
import { getProfileShareToken } from "./profile-share";
import { getSharedTripAnalyticsSends, getSharedTripSends } from "./sends";
import { getSharedTrip, getTripShareForOwner } from "./trip-shares";
import { getTripForUser } from "./trips";

const db = createDb(env.DB);

const OWNER = "owner";
const FRIEND = "friend";
const MEMBER = "member";
const LIMIT = 300;

let tripId: number;

async function share(expiresAt: string | null = null, trip = tripId) {
  const [row] = await db
    .insert(tripShareLinks)
    .values({ userId: OWNER, tripId: trip, expiresAt })
    .returning({ token: tripShareLinks.token });
  return row.token;
}

const statusOf = async (token: string) => (await getSharedTrip(db, token)).status;

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: OWNER, name: "Trip Owner", image: "avatars/owner" });
  await seedFixtureUser(db, { id: FRIEND, name: "Climbing Partner" });
  await seedFixtureUser(db, { id: MEMBER, name: "Passing Member" });
  await seedFixtureFriendship(db, OWNER, FRIEND);
  // Everything closed to everyone but the owner: the link is the only door.
  await db.run(sql`UPDATE user SET journal_visibility = 'private', trip_visibility = 'private',
    send_comment_visibility = 'private' WHERE id = ${OWNER}`);
  ({ id: tripId } = await seedFixtureTrip(db, {
    userId: OWNER,
    name: "Bishop",
    description: "Buttermilks.",
    notes: "Camped at the Pit.",
    startDate: "2026-03-10",
    endDate: "2026-03-14",
  }));
  await seedFixtureSend(db, {
    userId: OWNER,
    climbId: 1,
    dateSent: "2026-03-11",
    comment: "Finally.",
    videos: ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
  });
  // Outside the trip, and undated: never on the link.
  await seedFixtureSend(db, { userId: OWNER, climbId: 2, dateSent: "2026-04-01" });
  await seedFixtureSend(db, { userId: OWNER, climbId: 3, dateSent: null });
  await seedFixtureJournalEntry(db, {
    userId: OWNER,
    climbId: 2,
    entryDate: "2026-03-12",
    body: "Fell off the top.",
    tags: ["slab"],
  });
  await seedFixtureJournalEntry(db, {
    userId: OWNER,
    kind: "training",
    entryDate: "2026-03-13",
    body: "Hangboard.",
  });
  await seedFixtureJournalEntry(db, { userId: OWNER, climbId: 2, entryDate: "2026-02-28" });
});

describe("who can read a link", () => {
  it("opens the owner's own view of the trip for anyone holding the token", async () => {
    const token = await share();

    const { status, shared } = await getSharedTrip(db, token);
    expect(status).toBe("visible");
    expect(shared?.owner).toEqual({ id: OWNER, name: "Trip Owner", image: "avatars/owner" });
    expect(shared?.notes).toBe("Camped at the Pit.");
    // The counts are the owner's card's counts.
    const own = await getTripForUser(db, OWNER, tripId, OWNER);
    expect(shared?.trip).toEqual({ ...own, companions: [] });
    expect(shared?.trip).toMatchObject({ sendCount: 1, entryCount: 2, dayCount: 2, hasNotes: 1 });
  });

  it("answers hidden for an unknown token, and for a profile share token", async () => {
    await share();
    const profileToken = (await getProfileShareToken(db, OWNER))!;

    for (const token of ["0".repeat(32), profileToken]) {
      expect(await getSharedTrip(db, token)).toEqual({ status: "hidden" });
      expect((await getSharedTripSends(db, token, OWNER, LIMIT)).sends).toEqual([]);
      expect((await getSharedTripEntries(db, token, OWNER, LIMIT)).entries).toEqual([]);
    }
  });

  it("answers expired after the deadline, and reads nothing", async () => {
    const live = await share("2999-01-01 00:00:00");
    expect(await statusOf(live)).toBe("visible");

    await db.update(tripShareLinks).set({ expiresAt: "2001-01-01 00:00:00" });
    // Only the owner and trip ids, so the page can send the owner to renew it.
    expect(await getSharedTrip(db, live)).toEqual({ status: "expired", ownerId: OWNER, tripId });
    expect((await getSharedTripSends(db, live, OWNER, LIMIT)).sends).toEqual([]);
    expect((await getSharedTripEntries(db, live, OWNER, LIMIT)).entries).toEqual([]);
    expect(await getSharedTripAnalyticsSends(db, live, OWNER)).toEqual([]);
    expect(await getSharedTripAnalyticsSessions(db, live, OWNER)).toEqual([]);
  });

  it("dies when the profile goes private, and stays dead once it is public again", async () => {
    const token = await share();

    await db.run(sql`UPDATE user SET is_private = 1 WHERE id = ${OWNER}`);
    expect(await statusOf(token)).toBe("hidden");
    await db.run(sql`UPDATE user SET is_private = 0 WHERE id = ${OWNER}`);
    expect(await statusOf(token)).toBe("hidden");
    expect(await getTripShareForOwner(db, OWNER, tripId)).toBeNull();
  });

  it("refuses a private owner's link even if a row survives", async () => {
    const token = await share();
    // The trigger fires on the update; put a row back the way a share written
    // in the same moment would.
    await db.run(sql`UPDATE user SET is_private = 1 WHERE id = ${OWNER}`);
    await db.insert(tripShareLinks).values({ token, userId: OWNER, tripId });

    expect(await statusOf(token)).toBe("hidden");
    expect((await getSharedTripSends(db, token, OWNER, LIMIT)).sends).toEqual([]);
  });

  it("goes with the trip when the trip is deleted", async () => {
    const token = await share();
    await db.delete(trips).where(eq(trips.id, tripId));

    expect(await statusOf(token)).toBe("hidden");
    expect(await db.select().from(tripShareLinks)).toEqual([]);
  });

  it("never reads another climber's rows through the owner id argument", async () => {
    const token = await share();
    await seedFixtureSend(db, { userId: MEMBER, climbId: 1, dateSent: "2026-03-11" });

    expect((await getSharedTripSends(db, token, MEMBER, LIMIT)).sends).toEqual([]);
    expect((await getSharedTripEntries(db, token, MEMBER, LIMIT)).entries).toEqual([]);
  });
});

describe("what a link shows", () => {
  it("shows the trip's sends with their commentary, whatever the commentary audience", async () => {
    const token = await share();

    const { sends, hasMore } = await getSharedTripSends(db, token, OWNER, LIMIT);
    expect(hasMore).toBe(false);
    expect(sends).toHaveLength(1);
    expect(sends[0]).toMatchObject({
      climbName: "Test Highball",
      dateSent: "2026-03-11",
      comment: "Finally.",
      videos: ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    });
  });

  it("shows the trip's journal entries, whatever the journal audience", async () => {
    const token = await share();

    const { entries } = await getSharedTripEntries(db, token, OWNER, LIMIT);
    // The same rows the owner's own trip page reads, newest first.
    const own = await getJournalPage(
      db,
      OWNER,
      OWNER,
      { ...DEFAULT_JOURNAL_FILTER, dateFrom: "2026-03-10", dateTo: "2026-03-14" },
      null,
      LIMIT,
    );
    expect(entries).toEqual(own.entries);
    expect(entries.map((entry) => entry.body)).toEqual(["Hangboard.", "Fell off the top."]);
    // Hashtags travel with the entry.
    expect(entries[1].tags).toEqual(["slab"]);
  });

  it("follows the trip's current dates", async () => {
    const token = await share();
    await db.update(trips).set({ endDate: "2026-03-12" }).where(eq(trips.id, tripId));

    expect((await getSharedTripEntries(db, token, OWNER, LIMIT)).entries).toHaveLength(1);
    expect((await getSharedTrip(db, token)).shared?.trip).toMatchObject({
      endDate: "2026-03-12",
      entryCount: 1,
      sendCount: 1,
    });
  });

  it("names no tagged friends", async () => {
    const token = await share();
    const pair = friendshipPair(OWNER, FRIEND);
    await db.insert(tripCompanions).values({
      tripId,
      userId: FRIEND,
      friendshipUserId: pair.userId,
      friendshipFriendId: pair.friendId,
    });
    const [entry] = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(eq(journalEntries.entryDate, "2026-03-12"));
    await db.insert(journalCompanions).values({
      entryId: entry.id,
      userId: FRIEND,
      friendshipUserId: pair.userId,
      friendshipFriendId: pair.friendId,
    });

    expect((await getSharedTrip(db, token)).shared?.trip.companions).toEqual([]);
    const { entries } = await getSharedTripEntries(db, token, OWNER, LIMIT);
    expect(entries.every((row) => (row.companions ?? []).length === 0)).toBe(true);
    // The owner's own read still names them.
    expect((await getTripForUser(db, OWNER, tripId, OWNER))?.companions).toHaveLength(1);
  });

  it("feeds analytics only the trip's sends and sessions", async () => {
    const token = await share();

    expect(await getSharedTripAnalyticsSends(db, token, OWNER)).toEqual([
      expect.objectContaining({ climbName: "Test Highball", dateSent: "2026-03-11" }),
    ]);
    // Training and the session before the trip are left out.
    expect(await getSharedTripAnalyticsSessions(db, token, OWNER)).toEqual([
      { entryDate: "2026-03-12", climbType: "boulder", count: 1 },
    ]);
  });

  it("stops at the limit and says there is more", async () => {
    const token = await share();
    await seedFixtureSend(db, { userId: OWNER, climbId: 4, dateSent: "2026-03-12" });

    const { sends, hasMore } = await getSharedTripSends(db, token, OWNER, 1);
    expect(hasMore).toBe(true);
    expect(sends.map((send) => send.dateSent)).toEqual(["2026-03-12"]);
  });
});

describe("the owner's link", () => {
  it("is read back only for its owner", async () => {
    const token = await share("2999-01-01 00:00:00");

    expect(await getTripShareForOwner(db, OWNER, tripId)).toEqual({
      token,
      expiresAt: "2999-01-01 00:00:00",
    });
    expect(await getTripShareForOwner(db, MEMBER, tripId)).toBeNull();
  });
});
