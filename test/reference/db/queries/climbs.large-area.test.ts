import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, type Database } from "@/db/client";
import { areas, climbs } from "@/db/schema";
import { seedFixtureSend, seedFixtureUser } from "@/test/fixtures";
import { explainQueries } from "@/test/query-plans";

import { getArea, type Area } from "./areas";
import { getSubtreeClimbs, type SubtreeClimbsSort } from "./climbs";

// getSubtreeClimbs forces a different index (climbs_area_idx vs a per-sort
// index) depending on whether the queried area's subtree clears
// LARGE_AREA_SUBTREE_AREAS — SQLite picks one query plan per SQL *shape*,
// not per call, so this "large area" path is a genuinely different code path
// from climbs.test.ts's small-fixture-tree coverage, not just a bigger
// version of the same query. Seeding 1000+ real sub-areas just to reach the
// threshold would say nothing extra, so every call here spreads
// `largeSubtree` onto the area to select the branch directly — the same shape
// getAreaWithSubtreeSize hands the production callers.

let db: Database;
const AREA_ID = 9000;
const START_ID = 9001;

/** getSubtreeClimbs on the large-subtree branch, whatever the fixture's real size. */
function largeSubtreeClimbs(area: Area, sort: SubtreeClimbsSort = "ascents_desc") {
  return getSubtreeClimbs(db, { ...area, largeSubtree: true }, 1, sort);
}

beforeAll(async () => {
  db = createDb(env.DB);
  await db.insert(areas).values({
    id: AREA_ID,
    parentId: null,
    name: "Large Test Region",
  });

  await db.insert(climbs).values([
    { id: START_ID, areaId: AREA_ID, name: "Aardvark Wall", type: "boulder", grade: 5 },
    { id: START_ID + 1, areaId: AREA_ID, name: "Bandit Crack", type: "trad", grade: 2 },
    { id: START_ID + 2, areaId: AREA_ID, name: "Crusher Face", type: "sport", grade: 10 },
    { id: START_ID + 3, areaId: AREA_ID, name: "Driftwood Slab", type: "boulder", grade: 12 },
  ]);

  for (let i = 1; i <= 4; i += 1) {
    await seedFixtureUser(db, { id: `test-user-large-area-${i}`, name: `Large Area Tester ${i}` });
  }
  // Crusher Face (id START_ID+2): 2 sends, ratings 5 and 3 -> avg 4.
  await seedFixtureSend(db, {
    userId: "test-user-large-area-1",
    climbId: START_ID + 2,
    dateSent: "2026-01-01",
    rating: 5,
  });
  await seedFixtureSend(db, {
    userId: "test-user-large-area-2",
    climbId: START_ID + 2,
    dateSent: "2026-01-02",
    rating: 3,
  });
  // Aardvark Wall: one send rated 2, distinct from Crusher Face (4).
  await seedFixtureSend(db, {
    userId: "test-user-large-area-3",
    climbId: START_ID,
    dateSent: "2026-01-03",
    rating: 2,
  });
  // Bandit Crack, Driftwood Slab: no sends.
});

describe("getSubtreeClimbs on a large-area-shaped subtree", () => {
  it("sorts by ascent count descending — the page's default sort", async () => {
    const area = await getArea(db, AREA_ID);
    const { climbs } = await largeSubtreeClimbs(area!);
    expect(climbs.map((c) => c.name)).toEqual([
      "Crusher Face", // 2 sends
      "Aardvark Wall", // 1 send
      "Bandit Crack", // 0 sends (id tie-break before Driftwood Slab)
      "Driftwood Slab", // 0 sends
    ]);
  });

  it("sorts by ascent count ascending", async () => {
    const area = await getArea(db, AREA_ID);
    const { climbs } = await largeSubtreeClimbs(area!, "ascents_asc");
    expect(climbs.map((c) => c.name)).toEqual([
      "Bandit Crack",
      "Driftwood Slab",
      "Aardvark Wall",
      "Crusher Face",
    ]);
  });

  it("sorts by rating descending, with unrated climbs last", async () => {
    const area = await getArea(db, AREA_ID);
    const { climbs } = await largeSubtreeClimbs(area!, "rating_desc");
    expect(climbs.map((c) => c.name)).toEqual([
      "Crusher Face", // avg 4
      "Aardvark Wall",
      "Bandit Crack",
      "Driftwood Slab",
    ]);
  });

  it("sorts by rating ascending, with unrated climbs last", async () => {
    const area = await getArea(db, AREA_ID);
    const { climbs } = await largeSubtreeClimbs(area!, "rating_asc");
    expect(climbs.map((c) => c.name)).toEqual([
      "Aardvark Wall", // avg 2
      "Crusher Face", // avg 4
      "Bandit Crack",
      "Driftwood Slab",
    ]);
  });

  it("sorts by grade ascending", async () => {
    const area = await getArea(db, AREA_ID);
    const { climbs } = await largeSubtreeClimbs(area!, "grade_asc");
    expect(climbs.map((c) => c.name)).toEqual([
      "Bandit Crack", // grade 2
      "Aardvark Wall", // grade 5
      "Crusher Face", // grade 10
      "Driftwood Slab", // grade 12
    ]);
  });

  it("sorts by grade descending", async () => {
    const area = await getArea(db, AREA_ID);
    const { climbs } = await largeSubtreeClimbs(area!, "grade_desc");
    expect(climbs.map((c) => c.name)).toEqual([
      "Driftwood Slab",
      "Crusher Face",
      "Aardvark Wall",
      "Bandit Crack",
    ]);
  });

  it("sorts alphabetically by name ascending", async () => {
    const area = await getArea(db, AREA_ID);
    const { climbs } = await largeSubtreeClimbs(area!, "name_asc");
    expect(climbs.map((c) => c.name)).toEqual([
      "Aardvark Wall",
      "Bandit Crack",
      "Crusher Face",
      "Driftwood Slab",
    ]);
  });

  it("drives selective name filters from FTS on the large-subtree branch", async () => {
    const area = await getArea(db, AREA_ID);
    const result = await getSubtreeClimbs(db, { ...area!, largeSubtree: true }, 1, "ascents_desc", {
      disciplines: [],
      name: "Crusher",
    });
    expect(result.climbs.map((climb) => climb.name)).toEqual(["Crusher Face"]);

    const empty = await getSubtreeClimbs(db, { ...area!, largeSubtree: true }, 1, "ascents_desc", {
      disciplines: [],
      name: "No Such Large Area Climb",
    });
    expect(empty).toEqual({
      climbs: [],
      page: 1,
      pageSize: 50,
      hasNextPage: false,
    });
  });

  it("keeps broad short prefixes on the limit-bounded sort-index path", async () => {
    const area = await getArea(db, AREA_ID);
    const result = await getSubtreeClimbs(db, { ...area!, largeSubtree: true }, 1, "name_asc", {
      disciplines: [],
      name: "A",
    });
    expect(result.climbs.map((climb) => climb.name)).toEqual(["Aardvark Wall"]);

    const plans = await explainQueries(db, async () =>
      getSubtreeClimbs(db, { ...area!, largeSubtree: true }, 1, "name_asc", {
        disciplines: [],
        name: "A",
      }),
    );
    expect(plans).toHaveLength(1);
    const [plan] = plans;
    const details = plan.map((row) => row.detail).join("\n");
    expect(details).toContain("climbs_name_asc_idx");
    expect(details).not.toContain("TEMP B-TREE");
  });

  it("rejects a sort value with no matching index instead of inlining it into SQL", async () => {
    const area = await getArea(db, AREA_ID);
    await expect(largeSubtreeClimbs(area!, "not_a_real_sort" as never)).rejects.toThrow(
      "Invalid sort value",
    );
  });

  // The guard has to hold on the small-subtree branch too: that branch's
  // index name is a constant, so only checking the resolved name would let an
  // unknown sort through to the ORDER BY.
  it("rejects a sort value on the small-subtree branch as well", async () => {
    const area = await getArea(db, AREA_ID);
    await expect(
      getSubtreeClimbs(db, { ...area!, largeSubtree: false }, 1, "not_a_real_sort" as never),
    ).rejects.toThrow("Invalid sort value");
  });

  it("the query plan uses the sort-column index, not a full sort of the subtree", async () => {
    const plans = await explainQueries(db, async () =>
      largeSubtreeClimbs((await getArea(db, AREA_ID))!),
    );
    expect(plans).toHaveLength(1);
    const [plan] = plans;
    const details = plan.map((row) => row.detail);
    // Scanning the sort index in order, so no sort step and no early stop lost.
    expect(details.some((d) => d.includes("climbs_send_count_desc_idx"))).toBe(true);
    expect(details.some((d) => d.includes("TEMP B-TREE"))).toBe(false);
    // The subtree walk rides areas_parent_idx rather than scanning areas.
    expect(details.some((d) => d.includes("areas_parent_idx"))).toBe(true);
    // send_count is denormalized onto climbs; `sends` must not be touched.
    expect(details.some((d) => d.toLowerCase().includes("sends"))).toBe(false);
  });
});
