import { env } from "cloudflare:test";
import { beforeAll, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { seedFixtureSend, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getCatalogAreasAfter, getCatalogClimbsAfter } from "./catalog-export";

const db = createDb(env.DB);

beforeAll(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "sender" });
  // A logged send bumps climbs.send_count via trigger; the export must not see it.
  await seedFixtureSend(db, { userId: "sender", climbId: 1, dateSent: "2026-09-01", rating: 5 });
});

it("walks areas by id keyset with the public projection only", async () => {
  const first = await getCatalogAreasAfter(db, 0, 3);
  expect(first.map((area) => area.id)).toEqual([1, 2, 3]);
  expect(first[0]).toEqual({
    id: 1,
    parentId: null,
    name: "Test Crag",
    description: "A test crag.",
  });
  const rest = await getCatalogAreasAfter(db, 3, 3);
  expect(rest.map((area) => area.id)).toEqual([4, 5]);
  expect(rest[0]).toEqual({ id: 4, parentId: 2, name: "Test Highball Alcove", description: null });
});

it("walks climbs by id keyset without activity or rating columns", async () => {
  const first = await getCatalogClimbsAfter(db, 0, 2);
  expect(first.map((climb) => climb.id)).toEqual([1, 2]);
  expect(Object.keys(first[0]).sort()).toEqual(
    ["areaId", "description", "grade", "id", "name", "type"].sort(),
  );
  expect(first[0]).toEqual({
    id: 1,
    areaId: 4,
    name: "Test Highball",
    type: "boulder",
    grade: 5,
    description: null,
  });
  const rest = await getCatalogClimbsAfter(db, 2, 2);
  expect(rest.map((climb) => climb.id)).toEqual([3, 4]);
  expect(await getCatalogClimbsAfter(db, 4, 2)).toEqual([]);
});
