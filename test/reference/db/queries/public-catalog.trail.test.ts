import { env } from "cloudflare:test";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { getPublicAreaTrail, resolvePublicSubarea } from "@/db/queries/public-catalog";
import { seedFixtureTree } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const db = createDb(env.DB);

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
});

it("reads an area with its ancestors root first, ending on the area itself", async () => {
  const trail = await getPublicAreaTrail(db, 4);

  expect(trail).toEqual([
    { id: 1, name: "Test Crag", parentId: null, description: "A test crag." },
    { id: 2, name: "Test Boulders", parentId: 1, description: null },
    { id: 4, name: "Test Highball Alcove", parentId: 2, description: null },
  ]);
  expect(await getPublicAreaTrail(db, 1)).toEqual([trail[0]]);
  expect(await getPublicAreaTrail(db, 999)).toEqual([]);
});

it("scopes to a subarea only when it descends from the area", async () => {
  const boulders = { id: 2, name: "Test Boulders", parentId: 1 };

  expect(await resolvePublicSubarea(db, boulders, 4)).toMatchObject({ id: 4, parentId: 2 });
  // The sport wall is the boulders' sibling, not their subarea.
  expect(await resolvePublicSubarea(db, boulders, 3)).toBe(boulders);
  expect(await resolvePublicSubarea(db, boulders, 999)).toBe(boulders);
  expect(await resolvePublicSubarea(db, boulders, null)).toBe(boulders);
});
