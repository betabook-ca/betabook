import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { journalCompanions, tripShareLinks, user } from "@/db/schema";
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

import {
  getSharedTrip,
  getSharedTripEntries,
  getSharedTripSends,
  getTripShareForOwner,
} from "./trip-shares";
import { getTripsForOwner } from "./trips";

const db = createDb(env.DB);

const OWNER = "owner";
const FRIEND = "friend";
const CLIMB = 1;
const OTHER_CLIMB = 2;

const BISHOP = { startDate: "2026-03-10", endDate: "2026-03-20" };

let tripId = 0;

async function share(overrides: { expiresAt?: string | null; tripId?: number } = {}) {
  const [row] = await db
    .insert(tripShareLinks)
    .values({
      userId: OWNER,
      tripId: overrides.tripId ?? tripId,
      expiresAt: overrides.expiresAt ?? null,
    })
    .returning({ token: tripShareLinks.token });
  return row.token;
}

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: OWNER, name: "Trip Owner", image: "avatars/owner" });
  await seedFixtureUser(db, { id: FRIEND, name: "Friendly Climber" });
  await seedFixtureFriendship(db, OWNER, FRIEND);
  const trip = await seedFixtureTrip(db, { userId: OWNER, name: "Bishop", ...BISHOP });
  tripId = trip.id;

  await seedFixtureJournalEntry(db, {
    userId: OWNER,
    climbId: CLIMB,
    entryDate: "2026-03-15",
    body: "Inside the trip.",
    tags: ["beta"],
  });
  await seedFixtureJournalEntry(db, {
    userId: OWNER,
    climbId: CLIMB,
    entryDate: "2020-01-01",
    body: "Long before the trip.",
  });
});

describe("who can read a link", () => {
  it("opens for anyone holding the token, signed in or not", async () => {
    const access = await getSharedTrip(db, await share());
    expect(access.status).toBe("visible");
    expect(access.trip).toMatchObject({ name: "Bishop", ownerName: "Trip Owner" });
  });

  it("stays shut on a token nobody issued", async () => {
    expect(await getSharedTrip(db, "0".repeat(32))).toEqual({ status: "hidden" });
  });

  it("hides the link while the owner is private, without calling it expired", async () => {
    const token = await share();
    await db.run(sql`UPDATE user SET is_private = 1 WHERE id = ${OWNER}`);

    // The trigger revokes the row outright; either way the reader is never
    // told the difference between "no such link" and "that climber closed up".
    expect((await getSharedTrip(db, token)).status).toBe("hidden");
    expect(await getSharedTripEntries(db, token)).toEqual([]);
  });

  it("refuses a private owner even when the trigger never ran", async () => {
    // The trigger fires on UPDATE OF is_private, so a link written *after*
    // the profile closed survives it. That is the race `readableSql`'s
    // private check exists for, and the only way to reach it.
    await db.run(sql`UPDATE user SET is_private = 1 WHERE id = ${OWNER}`);
    const token = await share();

    expect(await getSharedTrip(db, token)).toEqual({ status: "hidden" });
    expect(await getSharedTripEntries(db, token)).toEqual([]);
    expect(await getSharedTripSends(db, token)).toEqual([]);
  });

  it("calls a passed deadline expired, which is a fact about the link not the climber", async () => {
    const token = await share({ expiresAt: "2020-01-01 00:00:00" });
    expect(await getSharedTrip(db, token)).toEqual({ status: "expired" });
    expect(await getSharedTripEntries(db, token)).toEqual([]);
    expect(await getSharedTripSends(db, token)).toEqual([]);
  });

  it("keeps a future deadline and an absent one both readable", async () => {
    // One link per trip, so the second deadline needs a second trip.
    const later = await seedFixtureTrip(db, { userId: OWNER, name: "Later", ...BISHOP });
    const dated = await share({ expiresAt: "2099-01-01 00:00:00" });
    const forever = await share({ tripId: later.id, expiresAt: null });

    expect((await getSharedTrip(db, dated)).status).toBe("visible");
    expect((await getSharedTrip(db, forever)).status).toBe("visible");
  });
});

describe("what a link reaches", () => {
  it("publishes the entries inside the window and nothing on either side", async () => {
    const token = await share();
    const entries = await getSharedTripEntries(db, token);

    expect(entries.map((entry) => entry.entryDate)).toEqual(["2026-03-15"]);
    expect(entries[0]).toMatchObject({ body: "Inside the trip.", tags: ["beta"] });
  });

  it("publishes each send as the owner logged it, exact date and opinion included", async () => {
    await seedFixtureSend(db, {
      userId: OWNER,
      climbId: CLIMB,
      dateSent: "2026-03-15",
      ascentStyle: "flash",
      rating: 4,
      suggestedGrade: 7,
      comment: "Felt soft.",
    });

    const [send] = await getSharedTripSends(db, await share());
    expect(send).toMatchObject({
      climbName: "Test Highball",
      dateSent: "2026-03-15",
      ascentStyle: "flash",
      rating: 4,
      suggestedGrade: 7,
      comment: "Felt soft.",
    });
  });

  it("never publishes an undated send, which cannot be shown to fall inside", async () => {
    await seedFixtureSend(db, {
      userId: OWNER,
      climbId: OTHER_CLIMB,
      dateSent: null,
      comment: "No date on this one.",
    });

    expect(await getSharedTripSends(db, await share())).toEqual([]);
  });

  it("never publishes a send dated outside the window", async () => {
    await seedFixtureSend(db, { userId: OWNER, climbId: OTHER_CLIMB, dateSent: "2020-01-01" });
    expect(await getSharedTripSends(db, await share())).toEqual([]);
  });

  it("counts exactly what the owner's own trip card counts", async () => {
    await seedFixtureSend(db, { userId: OWNER, climbId: CLIMB, dateSent: "2026-03-15" });
    await seedFixtureJournalEntry(db, {
      userId: OWNER,
      kind: "training",
      climbId: null,
      entryDate: "2026-03-16",
    });

    const [card] = await getTripsForOwner(db, OWNER);
    const access = await getSharedTrip(db, await share());

    expect(access.trip).toMatchObject({
      entryCount: card.entryCount,
      sendCount: card.sendCount,
      dayCount: card.dayCount,
    });
  });

  it("includes send commentary and ascent entries, which the link's own sends already publish", async () => {
    // The journal/send invariant requires an ascent to mirror its send's
    // date and comment exactly, so the send is seeded to match.
    await seedFixtureSend(db, {
      userId: OWNER,
      climbId: OTHER_CLIMB,
      dateSent: "2026-03-17",
      comment: "Sent it, felt great.",
    });
    await seedFixtureJournalEntry(db, {
      userId: OWNER,
      climbId: OTHER_CLIMB,
      entryDate: "2026-03-17",
      body: "Sent it, felt great.",
      sent: true,
      isAscent: true,
      isSendComment: true,
    });

    const entries = await getSharedTripEntries(db, await share());
    expect(entries.map((entry) => entry.body)).toContain("Sent it, felt great.");
  });

  it("never carries a companion's name to a link holder", async () => {
    const [entry] = await db.all<{ id: number }>(
      sql`SELECT id FROM journal_entries WHERE user_id = ${OWNER} AND entry_date = '2026-03-15'`,
    );
    const pair = friendshipPair(OWNER, FRIEND);
    await db.insert(journalCompanions).values({
      entryId: entry.id,
      userId: FRIEND,
      friendshipUserId: pair.userId,
      friendshipFriendId: pair.friendId,
    });

    const payload = JSON.stringify(await getSharedTripEntries(db, await share()));
    expect(payload).not.toContain(FRIEND);
    expect(payload).not.toContain("Friendly Climber");
  });

  it("never carries the owner's email, which is an account identifier", async () => {
    const access = await getSharedTrip(db, await share());
    expect(JSON.stringify(access)).not.toContain("@example.com");
  });

  it("reaches only the trip it was made for", async () => {
    // A window with nothing in it, so the assertion below is about the link
    // reaching one trip rather than about which entries happen to exist.
    const other = await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Squamish",
      startDate: "2019-06-01",
      endDate: "2019-06-05",
    });
    const token = await share({ tripId: other.id });

    const access = await getSharedTrip(db, token);
    expect(access.trip).toMatchObject({ name: "Squamish" });
    // The Bishop entry is outside Squamish's window, so the other trip's link
    // cannot see it even though the same climber owns both.
    expect(await getSharedTripEntries(db, token)).toEqual([]);
  });
});

describe("the link cannot outlive the trip", () => {
  it("dies with the trip", async () => {
    const token = await share();
    await db.run(sql`DELETE FROM trips WHERE id = ${tripId}`);

    expect(await getSharedTrip(db, token)).toEqual({ status: "hidden" });
  });

  it("dies with the account", async () => {
    const token = await share();
    await db.delete(user).where(sql`id = ${OWNER}`);

    expect(await getSharedTrip(db, token)).toEqual({ status: "hidden" });
  });

  it("cannot be pointed at a trip belonging to someone else", async () => {
    await seedFixtureUser(db, { id: "stranger", name: "Passing Climber" });
    const theirs = await seedFixtureTrip(db, { userId: "stranger", ...BISHOP });

    await expect(
      db.insert(tripShareLinks).values({ userId: OWNER, tripId: theirs.id }),
    ).rejects.toThrow(/Failed query/);
  });
});

describe("the owner's own view", () => {
  it("hands out the token only to its owner", async () => {
    const token = await share({ expiresAt: "2099-01-01 00:00:00" });

    expect(await getTripShareForOwner(db, OWNER, tripId)).toMatchObject({ token });
    expect(await getTripShareForOwner(db, FRIEND, tripId)).toBeNull();
  });

  it("reads as nothing shared when there is no link", async () => {
    expect(await getTripShareForOwner(db, OWNER, tripId)).toBeNull();
  });
});
