import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import SharedTripAnalyticsPageImpl, {
  generateMetadata as analyticsMetadata,
} from "@/app/trips/[token]/analytics/page";
import SharedTripPageImpl, { generateMetadata } from "@/app/trips/[token]/page";
import { SharedTripLayout } from "@/app/trips/[token]/shared-trip-shell";
import { createDb } from "@/db/client";
import { journalCompanions, journalEntries, tripCompanions, tripShareLinks } from "@/db/schema";
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
import { rendered } from "@/test/server-tree";

const SharedTripPage = rendered(SharedTripPageImpl, { expand: [SharedTripLayout] });
const SharedTripAnalyticsPage = rendered(SharedTripAnalyticsPageImpl, {
  expand: [SharedTripLayout],
});

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
vi.mock("@/lib/session", () => ({
  getMemberSession: async () =>
    session.userId ? { user: { id: session.userId, name: "Viewer" } } : null,
  getViewerGradePreferences: async () => ({ boulder: "hueco", rope: "yds" }),
}));
vi.mock("@/lib/request-timezone", () => ({ getRequestTimezone: async () => "UTC" }));
// Album pages come from Google; tests never fetch them.
vi.mock("@/lib/trip-album-loader", () => ({ loadAlbumPhotos: async () => [] }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const db = createDb(env.DB);
const OWNER = "owner";
const FRIEND = "friend";
const STRANGER = "stranger";
const ALBUM = "https://photos.app.goo.gl/Example1Album2Link3";

let tripId: number;

async function share(expiresAt: string | null = null) {
  const [row] = await db
    .insert(tripShareLinks)
    .values({ userId: OWNER, tripId, expiresAt })
    .returning({ token: tripShareLinks.token });
  return row.token;
}

const props = (token: string, search: Record<string, string> = {}) => ({
  params: Promise.resolve({ token }),
  searchParams: Promise.resolve(search),
});

/** Serializes the resolved tree, which is what actually reaches the client. */
async function pageJson(token: string) {
  return JSON.stringify(await SharedTripPage(props(token)));
}

beforeEach(async () => {
  session.userId = null;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, {
    id: OWNER,
    name: "Trip Owner",
    email: "owner@example.com",
    image: "avatars/owner-digest",
  });
  await seedFixtureUser(db, { id: FRIEND, name: "Tagged Friend" });
  await seedFixtureUser(db, { id: STRANGER, name: "Passing Stranger" });
  await seedFixtureFriendship(db, OWNER, FRIEND);
  // Every audience closed: whatever shows, the link showed it.
  await db.run(sql`UPDATE user SET journal_visibility = 'private', trip_visibility = 'private',
    send_comment_visibility = 'private' WHERE id = ${OWNER}`);
  ({ id: tripId } = await seedFixtureTrip(db, {
    userId: OWNER,
    name: "Bishop sentinel",
    description: "Description sentinel",
    notes: "Notes sentinel",
    albumUrl: ALBUM,
    startDate: "2026-03-10",
    endDate: "2026-03-14",
  }));
  await seedFixtureSend(db, {
    userId: OWNER,
    climbId: 1,
    dateSent: "2026-03-11",
    comment: "Commentary sentinel",
  });
  await seedFixtureSend(db, {
    userId: OWNER,
    climbId: 2,
    dateSent: "2026-06-01",
    comment: "Outside sentinel",
  });
  await seedFixtureJournalEntry(db, {
    userId: OWNER,
    climbId: 3,
    entryDate: "2026-03-12",
    body: "Session sentinel",
    tags: ["crimps"],
  });
  await seedFixtureJournalEntry(db, {
    userId: OWNER,
    climbId: 3,
    entryDate: "2026-02-01",
    body: "Before sentinel",
  });
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
});

it("shows the trip as its owner sees it, to a reader without an account", async () => {
  const token = await share();
  const payload = await pageJson(token);

  for (const shown of [
    "Trip Owner",
    "Bishop sentinel",
    "Description sentinel",
    "Notes sentinel",
    `"link":"${ALBUM}"`,
    "Commentary sentinel",
    "Session sentinel",
    "crimps",
  ]) {
    expect(payload).toContain(shown);
  }
  // The day cards hold the entry and the send, and the counts are the owner's.
  expect(payload).toContain('"entryCount":1');
  expect(payload).toContain('"sendCount":1');
  expect(payload).toContain('"linkTags":false');
  expect(payload).toContain('"isOwner":false');
  expect(payload).toContain(`"link":"${token}"`);
  // An invitation for a reader without an account.
  expect(payload).toContain("Climb with Trip Owner on Betabook");
});

it("shows nothing beyond the trip: no tagged friends, other days, email or Logbook links", async () => {
  const token = await share();
  const payload = await pageJson(token);

  for (const hidden of [
    "Tagged Friend",
    "Outside sentinel",
    "Before sentinel",
    "owner@example.com",
    `/users/${OWNER}/journal`,
    `/users/${OWNER}/sends`,
    `/users/${OWNER}/trips`,
    "ownerShare",
  ]) {
    expect(payload).not.toContain(hidden);
  }
});

it("shows a signed-in reader the same trip, without the invitation", async () => {
  const token = await share();
  session.userId = STRANGER;

  const payload = await pageJson(token);
  expect(payload).toContain("Session sentinel");
  expect(payload).toContain("Commentary sentinel");
  expect(payload).not.toContain("Climb with Trip Owner on Betabook");
});

it("sends the owner to their own trip page", async () => {
  const token = await share();
  session.userId = OWNER;

  await expect(SharedTripPage(props(token))).rejects.toThrow(
    `REDIRECT:/users/${OWNER}/trips/${tripId}`,
  );
  await expect(SharedTripAnalyticsPage(props(token))).rejects.toThrow(
    `REDIRECT:/users/${OWNER}/trips/${tripId}/analytics`,
  );
});

it("answers an expired link with the expired card, and a dead one with nothing", async () => {
  const token = await share("2001-01-01 00:00:00");
  const expired = await pageJson(token);
  expect(expired).toContain("This link has expired");
  expect(expired).toContain("Shared trips on Betabook can be set to expire.");
  expect(expired).not.toContain("sentinel");
  expect(expired).not.toContain("Trip Owner");

  for (const dead of ["0".repeat(32), "not-a-token"]) {
    await expect(SharedTripPage(props(dead))).rejects.toThrow("NOT_FOUND");
  }
  await db.update(tripShareLinks).set({ expiresAt: null });
  await db.run(sql`UPDATE user SET is_private = 1 WHERE id = ${OWNER}`);
  await expect(SharedTripPage(props(token))).rejects.toThrow("NOT_FOUND");
});

it("previews a live link by name only, and a dead one as nothing", async () => {
  const token = await share();

  for (const metadata of [generateMetadata, analyticsMetadata]) {
    const live = await metadata(props(token));
    expect(live.title).toEqual({ absolute: "Trip Owner · Bishop sentinel" });
    expect(JSON.stringify(live)).not.toMatch(/Notes sentinel|Session sentinel|2026/);
  }

  await db.delete(tripShareLinks);
  expect(await generateMetadata(props(token))).toEqual({
    title: "Shared trip",
    robots: { index: false },
  });
});

it("shows the trip's analytics, sessions included, linking back to the link", async () => {
  const token = await share();
  const tree = await SharedTripAnalyticsPage(props(token));
  const payload = JSON.stringify(tree);

  expect(payload).toContain("Activity on this trip");
  expect(payload).toContain('"journalVisible":true');
  expect(payload).toContain('"back":"trip"');
  expect(payload).not.toContain("Notes sentinel");
  expect(payload).not.toContain("Tagged Friend");
  // One send and one session inside the trip; the rest of the history stays out.
  expect(payload).toContain('"sendCount":1');
  expect(payload).not.toContain("Outside sentinel");
});
