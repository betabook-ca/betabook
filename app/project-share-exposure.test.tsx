import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import SharedProjectPage, { generateMetadata } from "@/app/projects/[token]/page";
import { createDb } from "@/db/client";
import { journalCompanions, journalEntries, projectShareLinks } from "@/db/schema";
import { friendshipPair } from "@/lib/friendships";
import {
  seedFixtureFriendship,
  seedFixtureJournalEntry,
  seedFixturePinnedProject,
  seedFixtureSend,
  seedFixtureTree,
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
const STRANGER = "stranger";
const CLIMB = 1;
const OTHER_CLIMB = 2;

async function share(expiresAt: string | null = null) {
  const [row] = await db
    .insert(projectShareLinks)
    .values({ userId: OWNER, climbId: CLIMB, expiresAt })
    .returning({ token: projectShareLinks.token });
  return row.token;
}

/** Serializes the rendered tree, which is what actually reaches the client. */
async function pageJson(token: string) {
  return JSON.stringify(await SharedProjectPage({ params: Promise.resolve({ token }) }));
}

beforeEach(async () => {
  session.userId = null;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, {
    id: OWNER,
    name: "Project Owner",
    email: "owner@example.com",
    image: "avatars/owner-digest",
  });
  await seedFixtureUser(db, { id: FRIEND, name: "Tagged Friend" });
  await seedFixtureUser(db, { id: STRANGER, name: "Passing Stranger" });
  await seedFixtureFriendship(db, OWNER, FRIEND);
  await seedFixturePinnedProject(db, { userId: OWNER, climbId: CLIMB });
  await seedFixtureJournalEntry(db, {
    userId: OWNER,
    climbId: CLIMB,
    entryDate: "2026-03-05",
    body: "Stuck the crux move.",
  });
});

it("shows the owner, the climb and the notes, and nothing else about them", async () => {
  await seedFixturePinnedProject(db, { userId: OWNER, climbId: OTHER_CLIMB });
  await seedFixtureJournalEntry(db, {
    userId: OWNER,
    climbId: OTHER_CLIMB,
    entryDate: "2026-04-01",
    body: "A different project entirely.",
  });
  const token = await share();

  const rendered = await pageJson(token);

  expect(rendered).toContain("Project Owner");
  expect(rendered).toContain("Test Highball");
  expect(rendered).toContain("Stuck the crux move.");
  // The link is for one project: no other climb, and no address for anything.
  expect(rendered).not.toContain("A different project entirely.");
  expect(rendered).not.toContain("Test Slab");
  expect(rendered).not.toContain("owner@example.com");
  expect(rendered).not.toContain(`"${OWNER}"`);
  expect(rendered).not.toContain("/users/owner");
});

it("never carries a companion's name to a link holder", async () => {
  const [entry] = await db
    .insert(journalEntries)
    .values({
      userId: OWNER,
      climbId: CLIMB,
      kind: "session",
      entryDate: "2026-03-10",
      body: "Session with a partner.",
    })
    .returning({ id: journalEntries.id });
  const pair = friendshipPair(OWNER, FRIEND);
  await db.insert(journalCompanions).values({
    entryId: entry.id,
    userId: FRIEND,
    friendshipUserId: pair.userId,
    friendshipFriendId: pair.friendId,
  });
  const token = await share();

  const rendered = await pageJson(token);

  expect(rendered).toContain("Session with a partner.");
  // The companion agreed to be tagged on the owner's journal, not to be named
  // to whoever holds this link.
  expect(rendered).not.toContain("Tagged Friend");
});

it("publishes a send by month, not by date", async () => {
  await seedFixtureSend(db, { userId: OWNER, climbId: CLIMB, dateSent: "2026-03-14" });
  const token = await share();

  const rendered = await pageJson(token);

  expect(rendered).toContain("2026-03");
  expect(rendered).not.toContain("2026-03-14");
});

it("404s a token that does not resolve", async () => {
  await share();

  await expect(pageJson("0".repeat(32))).rejects.toThrow("NOT_FOUND");
  await expect(pageJson("not-a-token")).rejects.toThrow("NOT_FOUND");
});

it("opens for a signed-out reader and a signed-in stranger alike", async () => {
  // A link has no audience, so being logged in changes nothing about access.
  // Only the sign-up prompt differs, which is why the session is read at all.
  const token = await share();

  const anonymous = await pageJson(token);
  session.userId = STRANGER;
  const stranger = await pageJson(token);

  for (const rendered of [anonymous, stranger]) {
    expect(rendered).toContain("Project Owner");
    expect(rendered).toContain("Test Highball");
  }
  expect(anonymous).toContain('"signedIn":false');
  expect(stranger).toContain('"signedIn":true');
});

it("says the link expired rather than naming anyone", async () => {
  const token = await share("2020-01-01 00:00:00");

  const rendered = await pageJson(token);

  expect(rendered).toContain("This link has expired");
  expect(rendered).not.toContain("Project Owner");
  expect(rendered).not.toContain("Stuck the crux move.");
});

it("previews as nothing once a link no longer resolves", async () => {
  const token = await share("2020-01-01 00:00:00");

  const metadata = await generateMetadata({ params: Promise.resolve({ token }) });

  expect(JSON.stringify(metadata)).not.toContain("Project Owner");
  expect(JSON.stringify(metadata)).not.toContain("Test Highball");
  expect(metadata.robots).toEqual({ index: false });
});

it("previews the project for anyone holding a live link", async () => {
  const token = await share();

  const metadata = await generateMetadata({ params: Promise.resolve({ token }) });

  expect(JSON.stringify(metadata)).toContain("Project Owner");
  expect(JSON.stringify(metadata)).toContain("Test Highball");
  // Still noindex: it names a climber, however open the link.
  expect(metadata.robots).toEqual({ index: false });
  // A preview is not a place to republish the climber's notes.
  expect(JSON.stringify(metadata)).not.toContain("Stuck the crux move.");
});
