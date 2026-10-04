import { env } from "cloudflare:test";
import { createRequestContext, runWithRequestContext } from "vinext/shims/unified-request-context";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { seedFixtureTree } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const trailReads = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
// The real query, counted: the assertion is how many times D1 is asked.
vi.mock("@/db/queries/public-catalog", async (original) => {
  const actual = await original<typeof import("@/db/queries/public-catalog")>();
  return {
    ...actual,
    getPublicAreaTrail: (...args: Parameters<typeof actual.getPublicAreaTrail>) => {
      trailReads.count += 1;
      return actual.getPublicAreaTrail(...args);
    },
  };
});

import {
  getPublicAncestorsById,
  getPublicAreaById,
  getPublicClimbById,
} from "@/app/public-catalog-reads";

const db = createDb(env.DB);
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(createRequestContext(), fn);

beforeEach(async () => {
  trailReads.count = 0;
  await resetDb(db);
  await seedFixtureTree(db);
});

it("serves a climb page's metadata and body from one area read", async () => {
  const [metadataArea, metadataAncestors, pageArea, pageAncestors, climb] = await inRequest(() =>
    Promise.all([
      getPublicAreaById(4),
      getPublicAncestorsById(4),
      getPublicAreaById(4),
      getPublicAncestorsById(4),
      getPublicClimbById(1),
    ]),
  );

  expect(trailReads.count).toBe(1);
  expect(metadataArea).toEqual({
    id: 4,
    name: "Test Highball Alcove",
    parentId: 2,
    description: null,
  });
  expect(metadataAncestors.map((area) => area.name)).toEqual(["Test Crag", "Test Boulders"]);
  expect(pageArea).toBe(metadataArea);
  expect(pageAncestors).toEqual(metadataAncestors);
  expect(climb).toMatchObject({ id: 1, name: "Test Highball", areaId: 4 });
});

it("reads again for the next request", async () => {
  await inRequest(() => getPublicAreaById(4));
  await inRequest(() => getPublicAncestorsById(4));

  expect(trailReads.count).toBe(2);
});

it("has nothing to show for an unknown area", async () => {
  const [area, ancestors] = await inRequest(() =>
    Promise.all([getPublicAreaById(999), getPublicAncestorsById(999)]),
  );

  expect(area).toBeUndefined();
  expect(ancestors).toEqual([]);
});
