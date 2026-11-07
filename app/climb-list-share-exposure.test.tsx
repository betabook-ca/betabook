import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import SharedListPageImpl, { generateMetadata } from "@/app/lists/[token]/page";
import { createDb } from "@/db/client";
import { climbListItems, climbListShareLinks, climbLists } from "@/db/schema";
import { seedFixtureSend, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";
import { rendered } from "@/test/server-tree";

const SharedListPage = rendered(SharedListPageImpl);

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
const READER = "reader";

let listId: number;

async function share(expiresAt: string | null = null) {
  const [row] = await db
    .insert(climbListShareLinks)
    .values({ userId: OWNER, listId, expiresAt })
    .returning({ token: climbListShareLinks.token });
  return row.token;
}

const props = (token: string, search: Record<string, string> = {}) => ({
  params: Promise.resolve({ token }),
  searchParams: Promise.resolve(search),
});

async function pageJson(token: string, search: Record<string, string> = {}) {
  return JSON.stringify(await SharedListPage(props(token, search)));
}

beforeEach(async () => {
  session.userId = null;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: OWNER, name: "List Owner", email: "owner@example.com" });
  await seedFixtureUser(db, { id: READER, name: "Passing Reader" });
  // Lists closed to everyone: whatever shows, the link showed it.
  await db.run(sql`UPDATE user SET climb_list_visibility = 'private' WHERE id = ${OWNER}`);
  [{ id: listId }] = await db
    .insert(climbLists)
    .values({ userId: OWNER, title: "Title sentinel", description: "Description sentinel" })
    .returning({ id: climbLists.id });
  await db.insert(climbListItems).values([
    { listId, climbId: 3, position: 1 },
    { listId, climbId: 1, position: 2 },
  ]);
  const [other] = await db
    .insert(climbLists)
    .values({ userId: OWNER, title: "Unshared sentinel" })
    .returning({ id: climbLists.id });
  await db.insert(climbListItems).values({ listId: other.id, climbId: 4, position: 1 });
  await seedFixtureSend(db, {
    userId: OWNER,
    climbId: 3,
    dateSent: "2026-03-11",
    comment: "Commentary sentinel",
  });
});

it("shows the list to a reader without an account, even when lists are Only me", async () => {
  const token = await share();
  const payload = await pageJson(token);

  for (const shown of ["List Owner", "Title sentinel", "Description sentinel", "Test Crimper"])
    expect(payload).toContain(shown);
  expect(payload).toContain("Test Highball");
  // No reader, so no sent state, and an invitation instead.
  expect(payload).toContain('"signedIn":false');
  expect(payload).toContain('"sent":null');
  expect(payload).toContain("Climb with List Owner on Betabook");
  // Copying needs an account to copy into.
  expect(payload).not.toContain("CopyClimbListButton");
  expect(payload).not.toContain(`"viewerId"`);
});

it("shows nothing beyond the list: not the owner's sends, other lists or email", async () => {
  const token = await share();
  const payload = await pageJson(token);
  for (const hidden of [
    "Unshared sentinel",
    "Test Crack",
    "Commentary sentinel",
    "owner@example.com",
    '"sent":true',
    `/users/${OWNER}/lists`,
  ])
    expect(payload).not.toContain(hidden);
});

it("shows a signed-in reader their own sent state, never the owner's", async () => {
  const token = await share();
  session.userId = READER;
  await seedFixtureSend(db, { userId: READER, climbId: 1, dateSent: "2026-04-01" });

  const payload = await pageJson(token, { excludeSent: "1" });
  // The reader sent the Highball, so Exclude sent drops it. The owner sent
  // the Crimper, which stays: the filter is the reader's sends, not theirs.
  expect(payload).not.toContain('"name":"Test Highball"');
  expect(payload).toContain('"name":"Test Crimper"');
  expect(payload).not.toContain("Climb with List Owner on Betabook");
  // A signed-in reader can copy, through the link they hold.
  expect(payload).toContain(`"viewerId":"${READER}","token":"${token}"`);
});

it("ignores Exclude sent for a reader without an account, who has no sends", async () => {
  const token = await share();
  const payload = await pageJson(token, { excludeSent: "1" });
  expect(payload).toContain('"name":"Test Highball"');
  expect(payload).toContain('"name":"Test Crimper"');
});

it("sends the owner to their own list page", async () => {
  const token = await share();
  session.userId = OWNER;
  await expect(SharedListPage(props(token))).rejects.toThrow(
    `REDIRECT:/users/${OWNER}/lists/${listId}`,
  );
});

it("says an expired link has expired, and 404s an unknown or revoked one", async () => {
  const expired = await share("2020-01-01 00:00:00");
  const payload = await pageJson(expired);
  expect(payload).toContain("This link has expired");
  expect(payload).not.toContain("Title sentinel");
  expect((await generateMetadata(props(expired))).title).toBe("Shared list");

  await expect(SharedListPage(props("0".repeat(32)))).rejects.toThrow("NOT_FOUND");

  await db.run(sql`DELETE FROM climb_list_share_links`);
  const live = await share();
  await db.run(sql`UPDATE user SET is_private = 1 WHERE id = ${OWNER}`);
  await expect(SharedListPage(props(live))).rejects.toThrow("NOT_FOUND");
});

it("previews a live link with the owner and list name, unindexed", async () => {
  const token = await share();
  const metadata = await generateMetadata(props(token));
  expect(metadata.title).toEqual({ absolute: "List Owner · Title sentinel" });
  expect(metadata.robots).toEqual({ index: false });
});
