import { env } from "cloudflare:test";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { seedFixtureFriendship, seedFixtureUser } from "@/test/fixtures";
import { explainQueries } from "@/test/query-plans";
import { resetDb } from "@/test/reset-db";

import { searchCompanionFriends } from "./journal-companions";

const db = createDb(env.DB);
/** A tagged friend is recognised by face as much as by name, so the picker
 * needs the photo alongside it. */
const PHOTOS: Record<string, string> = {
  a: "/api/avatars/a/abababababababababababababababab.webp",
  private: "/api/avatars/private/cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd.webp",
};
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureUser(db, { id: "viewer", name: "Alex Viewer" });
  for (const [id, name, isPrivate] of [
    ["a", "Alex Accepted", false],
    ["z", "Alex Reverse", false],
    ["pending", "Alex Pending", false],
    ["private", "Alex Private", true],
    ["stranger", "Alex Stranger", false],
  ] as const)
    await seedFixtureUser(db, { id, name, isPrivate, image: PHOTOS[id] ?? null });
  await seedFixtureFriendship(db, "viewer", "a");
  await seedFixtureFriendship(db, "z", "viewer");
  await seedFixtureFriendship(db, "viewer", "pending", "pending");
  await seedFixtureFriendship(db, "viewer", "private");
});
it("searches both directions of accepted friendships, including a private friend", async () => {
  expect(await searchCompanionFriends(db, "viewer", " Alex ")).toEqual([
    { id: "a", name: "Alex Accepted", image: PHOTOS.a },
    { id: "private", name: "Alex Private", image: PHOTOS.private },
    // A friend who never uploaded one falls back to initials in the picker.
    { id: "z", name: "Alex Reverse", image: null },
  ]);
});
it("does not treat wildcards as directory access and skips an empty query", async () => {
  expect(await searchCompanionFriends(db, "viewer", "%")).toEqual([]);
  expect(await searchCompanionFriends(db, "viewer", "_")).toEqual([]);
  expect(await searchCompanionFriends(db, "viewer", "")).toEqual([]);
});
it("caps matches and probes users by identity instead of scanning the directory", async () => {
  for (let i = 0; i < 25; i += 1) {
    const id = `match-${String(i).padStart(2, "0")}`;
    await seedFixtureUser(db, { id, name: `Match ${String(i).padStart(2, "0")}` });
    await seedFixtureFriendship(db, "viewer", id);
  }
  const matches = await searchCompanionFriends(db, "viewer", "Match");
  expect(matches.map((row) => row.id)).toEqual(
    Array.from({ length: 20 }, (_, i) => `match-${String(i).padStart(2, "0")}`),
  );
  const plans = (await explainQueries(db, () => searchCompanionFriends(db, "viewer", "Alex")))
    .flat()
    .map((row) => row.detail)
    .join("\n");
  expect(plans).toMatch(/SEARCH.*friendships/);
  expect(plans).toMatch(/SEARCH u USING INDEX sqlite_autoindex_user_1/);
  expect(plans).not.toMatch(/SCAN u(?:\s|$)/);
});
