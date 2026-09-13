import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { GET as areaClimbs } from "@/app/api/public/areas/[id]/climbs/route";
import { GET as areaSearch } from "@/app/api/public/search/areas/route";
import { GET as climbSearch } from "@/app/api/public/search/climbs/route";
import { createDb } from "@/db/client";
import { areas, climbs } from "@/db/schema";
import type { PublicClimbsPage } from "@/lib/public-catalog";
import { seedFixtureTree } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);
const request = (query: string) =>
  new Request(`https://betabook.ca/api/public/search/climbs?${query}`);
const context = (id: string) => ({ params: Promise.resolve({ id }) });
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
});
it("returns area descriptions and navigation fields, including suggestion mode", async () => {
  for (const query of ["name=Highball", "name=Highball&limit=5"]) {
    expect(await (await areaSearch(request(query))).json()).toEqual({
      areas: [
        {
          id: 4,
          parentId: 2,
          name: "Test Highball Alcove",
          description: null,
          ancestorPath: "Test Crag > Test Boulders",
        },
      ],
      hasNextPage: false,
    });
  }
});
it("returns route grades, disciplines, descriptions, aggregates and navigation", async () => {
  await db.update(climbs).set({
    description: "A public route description.",
    sendCount: 4,
    ratingSum: 16,
    ratingCount: 4,
  });
  expect(await (await climbSearch(request("name=Highball"))).json()).toEqual({
    climbs: [
      {
        id: 1,
        name: "Test Highball",
        areaId: 4,
        areaName: "Test Highball Alcove",
        grade: 5,
        type: "boulder",
        description: "A public route description.",
        avgRating: 4,
        sendCount: 4,
      },
    ],
    areaBreadcrumbs: {
      4: [
        { id: 1, name: "Test Crag" },
        { id: 2, name: "Test Boulders" },
      ],
    },
    hasNextPage: false,
  });
  const response = await areaClimbs(request(""), context("4"));
  expect(await response.json()).toEqual({
    climbs: [
      {
        id: 1,
        name: "Test Highball",
        areaId: 4,
        areaName: "Test Highball Alcove",
        grade: 5,
        type: "boulder",
        description: "A public route description.",
        avgRating: 4,
        sendCount: 4,
      },
    ],
    areaBreadcrumbs: {
      4: [
        { id: 1, name: "Test Crag" },
        { id: 2, name: "Test Boulders" },
      ],
    },
    hasNextPage: false,
  });
});
it("returns rope and unknown grades with their disciplines", async () => {
  await db.insert(climbs).values({ id: 20, areaId: 4, name: "Ungraded", type: "boulder" });
  const page = (await (await climbSearch(request(""))).json()) as PublicClimbsPage;
  expect(page.climbs.map(({ name, grade, type }) => ({ name, grade, type }))).toEqual([
    { name: "Test Crack", grade: 6, type: "trad" },
    { name: "Test Crimper", grade: 10, type: "sport" },
    { name: "Test Highball", grade: 5, type: "boulder" },
    { name: "Test Slab", grade: 2, type: "boulder" },
    { name: "Ungraded", grade: null, type: "boulder" },
  ]);
  expect(JSON.stringify(page)).not.toContain('"sendStats":');
});
it("scopes area name searches to a selected hierarchy by ID or name", async () => {
  for (const scope of ["areaId=2", "areaName=Boulders"]) {
    const response = await areaSearch(request(`name=Test&${scope}`));
    expect(await response.json()).toMatchObject({
      areas: [{ id: 2 }, { id: 4 }, { id: 5 }],
      hasNextPage: false,
    });
  }
});
it("paginates duplicate names stably on the shared climb ordering", async () => {
  await db.insert(climbs).values([
    { id: 20, areaId: 4, name: "Same", type: "boulder", grade: 1, sendCount: 2 },
    { id: 21, areaId: 4, name: "Same", type: "trad", grade: 20, sendCount: 9 },
  ]);
  const read = async (query: string) =>
    (await (await climbSearch(request(query))).json()) as PublicClimbsPage;
  const first = await read("name=Same&limit=1");
  const next = await read("name=Same&limit=1&offset=1");
  expect(first.climbs.map((row) => row.id)).toEqual([21]);
  expect(first.hasNextPage).toBe(true);
  expect(next.climbs.map((row) => row.id)).toEqual([20]);
  expect(next.hasNextPage).toBe(false);
  expect((await read("name=Test&sort=name_desc&limit=1")).climbs[0].name).toBe("Test Slab");
});
it("orders public climbs on the aggregates it now returns", async () => {
  await db.update(climbs).set({ sendCount: 1, ratingSum: 1, ratingCount: 1 });
  await db
    .update(climbs)
    .set({ sendCount: 40, ratingSum: 10, ratingCount: 2 })
    .where(eq(climbs.id, 3));
  await db
    .update(climbs)
    .set({ sendCount: 2, ratingSum: 8, ratingCount: 2 })
    .where(eq(climbs.id, 1));
  const read = async (query: string) =>
    ((await (await climbSearch(request(query))).json()) as PublicClimbsPage).climbs.map(
      (row) => row.name,
    );
  expect((await read("sort=ascents_desc")).slice(0, 2)).toEqual(["Test Crimper", "Test Highball"]);
  expect((await read("sort=rating_desc")).slice(0, 2)).toEqual(["Test Crimper", "Test Highball"]);
  // Absent sort is the member default, most ascents first.
  expect((await read("")).slice(0, 1)).toEqual(["Test Crimper"]);
});
it("keeps area lists inside the requested subtree, including invalid subarea selections", async () => {
  await db.insert(areas).values({ id: 10, name: "Elsewhere" });
  await db.insert(climbs).values({ id: 30, areaId: 10, name: "Outside", type: "sport", grade: 10 });
  const read = async (query: string, id = "2") =>
    (await (await areaClimbs(request(query), context(id))).json()) as PublicClimbsPage;
  expect((await read("")).climbs.map((row) => row.id)).toEqual([1, 2]);
  expect((await read("subarea=4", "1")).climbs.map((row) => row.id)).toEqual([1]);
  expect((await read("subarea=10&areaId=10")).climbs.map((row) => row.id)).toEqual([1, 2]);
  expect((await areaClimbs(request(""), context("missing"))).status).toBe(404);
});
it("narrows public climbs by discipline, alone and combined", async () => {
  const read = async (query: string) =>
    ((await (await climbSearch(request(query))).json()) as PublicClimbsPage).climbs.map(
      (row) => row.name,
    );
  expect(await read("discipline=boulder")).toEqual(["Test Highball", "Test Slab"]);
  expect(await read("discipline=sport&discipline=trad")).toEqual(["Test Crack", "Test Crimper"]);
  expect(await read("discipline=boulder&name=Slab")).toEqual(["Test Slab"]);
  expect(await read("discipline=sport&name=Slab")).toEqual([]);
});
it("narrows public climbs by grade within a discipline, excluding ungraded routes", async () => {
  await db.insert(climbs).values({ id: 20, areaId: 4, name: "Test Unknown", type: "boulder" });
  const read = async (query: string) =>
    ((await (await climbSearch(request(query))).json()) as PublicClimbsPage).climbs.map(
      (row) => row.name,
    );
  // V4 (grade 5) is inside 4–6; V1 (grade 2) and the ungraded route are not.
  expect(await read("discipline=boulder&boulderRange=4&boulderRange=6")).toEqual(["Test Highball"]);
  expect(await read("discipline=boulder&boulderRange=0&boulderRange=3")).toEqual(["Test Slab"]);
  // A full range keeps ungraded routes; a range without its discipline is inert.
  expect(await read("discipline=boulder")).toEqual(["Test Highball", "Test Slab", "Test Unknown"]);
  expect(await read("boulderRange=4&boulderRange=6")).toEqual([
    "Test Crack",
    "Test Crimper",
    "Test Highball",
    "Test Slab",
    "Test Unknown",
  ]);
});
it("applies discipline refinements to an area's own public climb list", async () => {
  const read = async (query: string, id: string) =>
    ((await (await areaClimbs(request(query), context(id))).json()) as PublicClimbsPage).climbs.map(
      (row) => row.name,
    );
  expect(await read("discipline=boulder", "1")).toEqual(["Test Highball", "Test Slab"]);
  expect(await read("discipline=trad", "1")).toEqual(["Test Crack"]);
  expect(await read("discipline=trad", "2")).toEqual([]);
});
it.each(["discipline=boulder", "boulderRange=4&boulderRange=6"])(
  "keeps climb refinement %s off the area list, which has no such column to narrow on",
  async (query) => {
    const response = await areaSearch(request(query));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Not signed in" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  },
);
it("orders public climbs by grade, keeping ties and ungraded routes off member aggregates", async () => {
  await db.insert(climbs).values({ id: 20, areaId: 4, name: "Test Unknown", type: "boulder" });
  // A high rating and ascent count on the easiest route: if either reached the
  // ordering, this row would not stay first ascending.
  await db
    .update(climbs)
    .set({ sendCount: 99, ratingSum: 50, ratingCount: 10 })
    .where(eq(climbs.id, 2));
  const read = async (query: string) =>
    ((await (await climbSearch(request(query))).json()) as PublicClimbsPage).climbs.map(
      (row) => row.name,
    );
  expect(await read("sort=grade_asc")).toEqual([
    "Test Slab",
    "Test Highball",
    "Test Crack",
    "Test Crimper",
    "Test Unknown",
  ]);
  expect(await read("sort=grade_desc")).toEqual([
    "Test Crimper",
    "Test Crack",
    "Test Highball",
    "Test Slab",
    "Test Unknown",
  ]);
});
it.each(["sort=grade_asc", "sort=grade_desc"])(
  "keeps climb ordering %s off the area list, which has no grade to order on",
  async (query) => {
    expect((await areaSearch(request(query))).status).toBe(401);
  },
);
it.each(["ratingRange=5", "minAscents=10", "sort=rating_desc", "sort=ascents_desc"])(
  "keeps climb refinement %s off the area list, which has no such column",
  async (query) => {
    expect((await areaSearch(request(query))).status).toBe(401);
  },
);
it.each(["type=trad", "grade=9", "count=1"])(
  "rejects protected query %s without exposing matching names",
  async (query) => {
    for (const response of [
      await areaSearch(request(query)),
      await climbSearch(request(query)),
      await areaClimbs(request(query), context("missing")),
    ]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Not signed in" });
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  },
);
it("bounds malformed and excessive pagination without returning protected fields", async () => {
  const response = await climbSearch(request("name=Test&offset=10001"));
  expect(await response.json()).toEqual({ climbs: [], areaBreadcrumbs: {}, hasNextPage: false });
  const invalid = await climbSearch(request("name=Test&limit=bad"));
  const page: PublicClimbsPage = await invalid.json();
  expect(page.climbs.map((row) => row.id)).toEqual([4, 3, 1, 2]);
});
