import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import SharedTripPage, { generateMetadata } from "@/app/trips/[token]/page";
import { createDb } from "@/db/client";
import { journalCompanions, tripShareLinks } from "@/db/schema";
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

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
vi.mock("@/lib/session", () => ({
  getMemberSession: async () =>
    session.userId ? { user: { id: session.userId, name: "Viewer" } } : null,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const db = createDb(env.DB);
const OWNER = "owner";
const FRIEND = "friend";
const CLIMB = 1;

let tripId = 0;

async function share(expiresAt: string | null = null) {
  const [row] = await db
    .insert(tripShareLinks)
    .values({ userId: OWNER, tripId, expiresAt })
    .returning({ token: tripShareLinks.token });
  return row.token;
}

/** The page returns either a plain element (the expired card) or the
 * `SharedTrip` component. Rendering the component when there is one puts the
 * published text in the string under assertion rather than only its props. */
async function pageJson(token: string) {
  const tree = (await SharedTripPage({ params: Promise.resolve({ token }) })) as {
    type?: unknown;
    props?: Record<string, unknown>;
  };
  const rendered =
    typeof tree?.type === "function" ? (tree.type as (p: unknown) => unknown)(tree.props) : null;
  return JSON.stringify(tree) + JSON.stringify(rendered);
}

beforeEach(async () => {
  session.userId = null;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: OWNER, name: "Alex Rivera" });
  await seedFixtureUser(db, { id: FRIEND, name: "Sam Companion" });
  await seedFixtureFriendship(db, OWNER, FRIEND);
  tripId = (
    await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Bishop",
      description: "Buttermilks.",
      startDate: "2026-03-10",
      endDate: "2026-03-20",
    })
  ).id;
  await seedFixtureJournalEntry(db, {
    userId: OWNER,
    climbId: CLIMB,
    entryDate: "2026-03-15",
    body: "Stuck the crux move.",
    tags: ["beta"],
  });
});

it("shows the trip, its notes and its sends, as the owner's own tabs show them", async () => {
  await seedFixtureSend(db, {
    userId: OWNER,
    climbId: CLIMB,
    dateSent: "2026-03-16",
    rating: 4,
    suggestedGrade: 7,
    comment: "Felt soft for the grade.",
  });

  const payload = await pageJson(await share());

  expect(payload).toContain("Bishop");
  expect(payload).toContain("Buttermilks.");
  expect(payload).toContain("Stuck the crux move.");
  // The send travels whole: exact date and the climber's own opinion.
  expect(payload).toContain("2026-03-16");
  expect(payload).toContain("Felt soft for the grade.");
  expect(payload).toContain("Alex Rivera");
});

it("never carries a companion's name to a link holder", async () => {
  const [entry] = await db.all<{ id: number }>(
    sql`SELECT id FROM journal_entries WHERE user_id = ${OWNER} LIMIT 1`,
  );
  const pair = friendshipPair(OWNER, FRIEND);
  await db.insert(journalCompanions).values({
    entryId: entry.id,
    userId: FRIEND,
    friendshipUserId: pair.userId,
    friendshipFriendId: pair.friendId,
  });

  const payload = await pageJson(await share());
  // The entry itself is published; only the third party's name is not.
  expect(payload).toContain("Stuck the crux move.");
  expect(payload).not.toContain("Sam Companion");
  expect(payload).not.toContain(FRIEND);
});

it("never carries the owner's email, which is an account identifier", async () => {
  expect(await pageJson(await share())).not.toContain("@example.com");
});

it("never carries an entry from outside the trip's own dates", async () => {
  await seedFixtureJournalEntry(db, {
    userId: OWNER,
    climbId: CLIMB,
    entryDate: "2020-01-01",
    body: "Years before this trip.",
  });

  expect(await pageJson(await share())).not.toContain("Years before this trip.");
});

it("404s a token that does not resolve, and one that is not a token at all", async () => {
  await expect(pageJson("0".repeat(32))).rejects.toThrow("NOT_FOUND");
  await expect(pageJson("not-a-token")).rejects.toThrow("NOT_FOUND");
});

it("reports an expired link as a state of the link, naming nobody", async () => {
  const payload = await pageJson(await share("2020-01-01 00:00:00"));

  expect(payload).toContain("This link has expired");
  expect(payload).not.toContain("Alex Rivera");
  expect(payload).not.toContain("Bishop");
  expect(payload).not.toContain("Stuck the crux move.");
});

it("previews as nothing once a link no longer resolves", async () => {
  const live = await generateMetadata({ params: Promise.resolve({ token: await share() }) });
  expect(JSON.stringify(live)).toContain("Alex Rivera");

  await db.run(sql`DELETE FROM trip_share_links`);
  const dead = await generateMetadata({
    params: Promise.resolve({ token: "0".repeat(32) }),
  });
  expect(dead).toMatchObject({ title: "Shared trip", robots: { index: false } });
  expect(JSON.stringify(dead)).not.toContain("Alex Rivera");
});

it("keeps the preview out of search results even when the link is live", async () => {
  const preview = await generateMetadata({
    params: Promise.resolve({ token: await share() }),
  });
  expect(preview).toMatchObject({ robots: { index: false } });
  // No canonical and no og:url: a crawler following either would fetch the
  // plain page, which is what withholding the preview is protecting.
  expect(preview.alternates).toBeUndefined();
  expect(preview.openGraph).not.toHaveProperty("url");
});

it("offers a signed-out reader the sign-up prompt, and a member none", async () => {
  const token = await share();

  expect(await pageJson(token)).toContain("Sign up");

  session.userId = FRIEND;
  expect(await pageJson(token)).not.toContain("Sign up");
});
