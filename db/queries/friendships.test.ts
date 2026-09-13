import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { user } from "@/db/schema";
import {
  seedFixtureFriendship,
  seedFixtureUser,
  seedManyFriendships,
  seedManyUsers,
} from "@/test/fixtures";
import { explainQueries } from "@/test/query-plans";
import { resetDb } from "@/test/reset-db";

import {
  getClimberSuggestions,
  getClimbersPage,
  getFriendship,
  getFriendsPage,
  getPendingFriendRequestCount,
} from "./friendships";

const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  for (const [id, name] of [
    ["viewer", "Alice Viewer"],
    ["alice", "Alice"],
    ["alex", "Alice Partner"],
    ["hidden", "Alice Hidden"],
    ["literal", "Al%pine"],
    ["outsider", "Outsider"],
  ])
    await seedFixtureUser(db, { id, name, isPrivate: id === "hidden" });
  await seedFixtureFriendship(db, "viewer", "alice");
  await seedFixtureFriendship(db, "hidden", "viewer", "pending");
  await seedFixtureFriendship(db, "viewer", "alex", "pending");
});

it("finds public names case-insensitively, exact first, with only the viewer's friendship state", async () => {
  expect(await getClimbersPage(db, "viewer", { name: "ALICE", pageSize: 1 })).toEqual({
    climbers: [{ id: "alice", name: "Alice", image: null, friendshipStatus: "friends" }],
    hasMore: true,
  });
  expect(await getClimbersPage(db, "viewer", { name: "ALICE", pageSize: 1, offset: 1 })).toEqual({
    climbers: [{ id: "alex", name: "Alice Partner", image: null, friendshipStatus: "outgoing" }],
    hasMore: false,
  });
  expect((await getClimbersPage(db, null, { name: "Al%" })).climbers).toEqual([
    { id: "literal", name: "Al%pine", image: null, friendshipStatus: "none" },
  ]);
  expect(await getClimbersPage(db, null)).toEqual({ climbers: [], hasMore: false });
  expect(
    (await getClimbersPage(db, "outsider", { name: "Alice" })).climbers.map(
      (row) => row.friendshipStatus,
    ),
  ).toEqual(["none", "none", "none"]);
});

it("shows an accepted connection from either direction and scopes private requester identities", async () => {
  expect(await getFriendship(db, "viewer", "alice")).toBe("friends");
  expect(await getFriendship(db, "alice", "viewer")).toBe("friends");
  expect(await getFriendship(db, null, "alice")).toBe("none");
  expect((await getFriendsPage(db, "viewer")).friends.map((row) => row.id)).toEqual(["alice"]);
  expect((await getFriendsPage(db, "alice")).friends.map((row) => row.id)).toEqual(["viewer"]);
  const requests = await getFriendsPage(db, "viewer", true);
  expect(
    requests.friends
      .map((row) => [row.id, row.friendshipStatus, row.isPrivate])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ).toEqual([
    ["alex", "outgoing", false],
    ["hidden", "incoming", true],
  ]);
  expect(JSON.stringify(requests)).not.toContain("email");
  expect(await getPendingFriendRequestCount(db, "viewer")).toBe(1);
  expect(await getPendingFriendRequestCount(db, "alex")).toBe(1);
  expect(await getPendingFriendRequestCount(db, "hidden")).toBe(0);
  expect(await getFriendsPage(db, "outsider", true)).toEqual({ friends: [], hasMore: false });
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "alice"));
  expect(
    (await getClimbersPage(db, "viewer", { name: "Alice" })).climbers.map((row) => row.id),
  ).toEqual(["alex"]);
  expect((await getFriendsPage(db, "viewer")).friends).toEqual([
    { id: "alice", name: "Alice", image: null, isPrivate: true, friendshipStatus: "friends" },
  ]);
});

it("paginates accepted friends in both directions without including pending or unrelated pairs", async () => {
  for (let i = 0; i < 23; i += 1) {
    const id = `partner-${i}`;
    await seedFixtureUser(db, { id });
    await seedFixtureFriendship(db, i % 2 ? "viewer" : id, i % 2 ? id : "viewer");
  }
  await seedFixtureFriendship(db, "outsider", "hidden");
  const first = await getFriendsPage(db, "viewer");
  const next = await getFriendsPage(db, "viewer", false, 20);
  expect(first.friends).toHaveLength(20);
  expect(first.hasMore).toBe(true);
  expect(next.friends).toHaveLength(4);
  expect(next.hasMore).toBe(false);
  expect([...first.friends, ...next.friends].map((row) => row.id).sort()).toEqual(
    ["alice", ...Array.from({ length: 23 }, (_, i) => `partner-${i}`)].sort(),
  );
});

it("suggests public friends of public friends, ranked by friends in common", async () => {
  for (const [id, name] of [
    ["sam", "Sam"],
    ["pat", "Pat"],
    ["priv", "Priv"],
    ["casey", "Casey"],
    ["drew", "Drew"],
    ["blake", "Blake"],
    ["secret", "Secret"],
    ["via-private", "Via Private"],
    ["pending-hop", "Pending Hop"],
    ["requested", "Requested"],
    ["incoming", "Incoming"],
  ])
    await seedFixtureUser(db, { id, name, isPrivate: id === "priv" || id === "secret" });
  await seedManyFriendships(db, "viewer", ["sam", "pat", "priv"]);
  await seedManyFriendships(db, "sam", [
    "pat",
    "casey",
    "drew",
    "blake",
    "secret",
    "requested",
    "incoming",
  ]);
  await seedFixtureFriendship(db, "casey", "pat");
  await seedFixtureFriendship(db, "via-private", "priv");
  await seedFixtureFriendship(db, "pending-hop", "sam", "pending");
  await seedFixtureFriendship(db, "viewer", "requested", "pending");
  await seedFixtureFriendship(db, "incoming", "viewer", "pending");
  const suggestion = (id: string, name: string, mutualFriendCount: number) => ({
    id,
    name,
    image: null,
    friendshipStatus: "none",
    mutualFriendCount,
  });

  expect(await getClimberSuggestions(db, "viewer")).toEqual([
    suggestion("casey", "Casey", 2),
    suggestion("blake", "Blake", 1),
    suggestion("drew", "Drew", 1),
  ]);
  expect((await getClimberSuggestions(db, "viewer", 2)).map((row) => row.id)).toEqual([
    "casey",
    "blake",
  ]);
  expect((await getClimberSuggestions(db, "casey")).map((row) => row.id)).toEqual([
    "viewer",
    "blake",
    "drew",
    "incoming",
    "requested",
  ]);
  expect(await getClimberSuggestions(db, "outsider")).toEqual([]);
  expect(JSON.stringify(await getClimberSuggestions(db, "viewer"))).not.toMatch(/sam|pat|email/);

  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "sam"));
  expect(await getClimberSuggestions(db, "viewer")).toEqual([suggestion("casey", "Casey", 1)]);
});

it("reads friends of friends through the pair indexes and groups them before per-candidate lookups", async () => {
  const friends = Array.from({ length: 20 }, (_, i) => `friend-${i}`);
  const others = Array.from({ length: 20 }, (_, i) => `other-${i}`);
  await seedManyUsers(
    db,
    [...friends, ...others].map((id) => ({ id })),
  );
  await seedManyFriendships(db, "viewer", friends);
  for (const friend of friends) await seedManyFriendships(db, friend, others);
  const rows = await getClimberSuggestions(db, "viewer");
  expect(rows).toHaveLength(6);
  expect(rows.map((row) => row.mutualFriendCount)).toEqual([20, 20, 20, 20, 20, 20]);
  const plans = await explainQueries(db, () => getClimberSuggestions(db, "viewer"));
  const detail = plans
    .flat()
    .map((row) => row.detail)
    .join("\n");
  expect(detail).toMatch(/friendships_friend_idx/);
  expect(detail).toMatch(/sqlite_autoindex_friendships_1/);
  expect(detail).not.toMatch(/SCAN (f|friendships|u|user)\b/);
  const grouped = detail.indexOf("USE TEMP B-TREE FOR GROUP BY");
  expect(grouped).toBeGreaterThan(-1);
  expect(grouped).toBeLessThan(detail.lastIndexOf("SEARCH u "));
});
