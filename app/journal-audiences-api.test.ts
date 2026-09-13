import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { GET as climbSends } from "@/app/api/climbs/[id]/sends/route";
import { GET as friends } from "@/app/api/friends/route";
import { GET as journal } from "@/app/api/users/[id]/journal/route";
import { GET as sends } from "@/app/api/users/[id]/sends/route";
import { generateMetadata as journalMetadata } from "@/app/users/[id]/journal/page";
import { createDb } from "@/db/client";
import { friendships, user } from "@/db/schema";
import {
  seedFixtureUser,
  seedFixtureFriendship,
  seedFixtureTree,
  seedFixtureSend,
  seedFixtureJournalEntry,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const state = vi.hoisted(() => ({ viewer: "reader" as string | null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/app/users/[id]/journal-view", () => ({ JournalView: () => null }));
vi.mock("@/app/users/[id]/profile-shell", async () => {
  const { getDb } = await import("@/db/client");
  const { getUser, canReadJournal } = await import("@/db/queries");
  return {
    ProfileHeader: () => null,
    getUserById: async (id: string) => getUser(await getDb(), id),
    canReadUserJournal: async (id: string, viewerId: string | null) =>
      canReadJournal(await getDb(), id, viewerId),
  };
});
vi.mock("@/lib/session", () => ({
  getSession: async () => (state.viewer ? { user: { id: state.viewer } } : null),
  getMemberSession: async () => (state.viewer ? { user: { id: state.viewer } } : null),
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);
const request = (path: string) => new Request(`https://betabook.ca${path}`);
const owner = { params: Promise.resolve({ id: "author" }) };
beforeEach(async () => {
  await resetDb(db);
  state.viewer = "reader";
  await seedFixtureTree(db);
  await seedFixtureUser(db, {
    id: "author",
    journalVisibility: "friends",
    sendCommentVisibility: "friends",
  });
  await seedFixtureUser(db, { id: "reader" });
  await seedFixtureSend(db, {
    userId: "author",
    climbId: 1,
    dateSent: "2026-09-01",
    comment: "Friends-only note",
  });
  await seedFixtureJournalEntry(db, {
    id: 30,
    userId: "author",
    kind: "training",
    entryDate: "2026-09-01",
    body: "Friends-only training",
    tags: ["restricted"],
  });
  await seedFixtureFriendship(db, "reader", "author", "pending");
});

it("requires an accepted friendship for journal pagination and removes access when the friendship ends", async () => {
  expect((await journal(request("/api/users/author/journal?viewerId=author"), owner)).status).toBe(
    404,
  );
  await db.update(friendships).set({ status: "accepted" });
  const connected = await journal(request("/api/users/author/journal"), owner);
  expect(connected.status).toBe(200);
  expect(connected.headers.get("cache-control")).toBe("private, no-store");
  expect(await connected.json()).toMatchObject({
    entries: [{ body: "Friends-only training", tags: ["restricted"] }],
  });
  await db.delete(friendships);
  expect((await journal(request("/api/users/author/journal"), owner)).status).toBe(404);
  state.viewer = "author";
  expect((await journal(request("/api/users/author/journal"), owner)).status).toBe(200);
});

it("protects journal metadata using the same friendship rules", async () => {
  const props = { ...owner, searchParams: Promise.resolve({}) };
  await expect(journalMetadata(props)).rejects.toThrow("not found");
  await db.update(friendships).set({ status: "accepted" });
  expect(await journalMetadata(props)).toMatchObject({
    title: "Test Climber author · Journal",
    robots: { index: false },
  });
  await db.delete(friendships);
  await expect(journalMetadata(props)).rejects.toThrow("not found");
});

it("scopes the request inbox to each participant and ignores a supplied owner ID", async () => {
  await seedFixtureUser(db, { id: "outsider" });
  state.viewer = "outsider";
  expect(
    await (await friends(request("/api/friends?ownerId=author&view=requests"))).json(),
  ).toEqual({ friends: [], hasMore: false });
  state.viewer = "reader";
  expect(
    await (await friends(request("/api/friends?ownerId=author&view=requests"))).json(),
  ).toMatchObject({ friends: [{ id: "author", friendshipStatus: "outgoing" }] });
  state.viewer = "author";
  const response = await friends(request("/api/friends?ownerId=reader&view=requests"));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({
    friends: [{ id: "reader", friendshipStatus: "incoming" }],
  });
  state.viewer = null;
  expect((await friends(request("/api/friends"))).status).toBe(401);
});

it("propagates the viewer to profile and climb send notes without caching restricted responses", async () => {
  const routes = [
    () => sends(request("/api/users/author/sends"), owner),
    () => climbSends(request("/api/climbs/1/sends"), { params: Promise.resolve({ id: "1" }) }),
  ];
  for (const read of routes) {
    const hidden = await read();
    expect(await hidden.json()).toMatchObject({ sends: [{ comment: null }] });
  }
  await db.update(friendships).set({ status: "accepted" });
  for (const read of routes) {
    const visible = await read();
    expect(visible.headers.get("cache-control")).toBe("private, no-store");
    expect(await visible.json()).toMatchObject({ sends: [{ comment: "Friends-only note" }] });
  }
  state.viewer = null;
  expect((await journal(request("/api/users/author/journal"), owner)).status).toBe(401);
  expect(await (await sends(request("/api/users/author/sends"), owner)).json()).toMatchObject({
    error: "Not signed in",
  });
});

it.each([
  {
    journalVisibility: "private",
    sendCommentVisibility: "public",
    journalStatus: 404,
    comment: "Friends-only note",
  },
  {
    journalVisibility: "public",
    sendCommentVisibility: "private",
    journalStatus: 200,
    comment: null,
  },
  {
    journalVisibility: "friends",
    sendCommentVisibility: "public",
    journalStatus: 404,
    comment: "Friends-only note",
  },
] as const)(
  "serves $sendCommentVisibility commentary separately from a $journalVisibility journal",
  async ({ journalVisibility, sendCommentVisibility, journalStatus, comment }) => {
    await db
      .update(user)
      .set({ journalVisibility, sendCommentVisibility })
      .where(eq(user.id, "author"));
    await seedFixtureJournalEntry(db, {
      id: 100,
      userId: "author",
      climbId: 1,
      entryDate: "2026-09-01",
      sent: true,
      isAscent: true,
      body: "Friends-only note",
    });
    state.viewer = "reader";
    expect(await (await sends(request("/api/users/author/sends"), owner)).json()).toMatchObject({
      sends: [{ comment }],
    });
    expect(
      await (
        await climbSends(request("/api/climbs/1/sends"), { params: Promise.resolve({ id: "1" }) })
      ).json(),
    ).toMatchObject({ sends: [{ comment }] });
    const response = await journal(request("/api/users/author/journal"), owner);
    expect(response.status).toBe(journalStatus);
    if (journalStatus === 200) {
      expect(await response.json()).toMatchObject({
        entries: [{ id: 100, body: null }, { body: "Friends-only training" }],
      });
      expect(
        await (
          await journal(request("/api/users/author/journal?q=Friends-only%20note"), owner)
        ).json(),
      ).toMatchObject({ entries: [] });
    }
  },
);
