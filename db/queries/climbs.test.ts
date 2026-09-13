import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb, type Database } from "@/db/client";
import { areas, climbs } from "@/db/schema";
import {
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
  seedManyAreas,
  seedManyClimbs,
} from "@/test/fixtures";
import { explainQueries } from "@/test/query-plans";
import { resetDb } from "@/test/reset-db";

import { getArea } from "./areas";
import {
  countSearchClimbs,
  findClimbCandidatesByNames,
  findClimbCandidatesInAreas,
  getAreaWithSubtreeSize,
  getClimbsByIds,
  CLIMB_CANDIDATES_PER_NAME,
  getClimb,
  getSubtreeClimbs,
  getSubtreeGradeHistogram,
  hasClimbsInArea,
  searchClimbs,
  LARGE_AREA_SUBTREE_AREAS,
} from "./climbs";

// getSubtreeClimbs forces climbs_area_idx below LARGE_AREA_SUBTREE_AREAS
// (see climbs.ts) — this fixture tree has a handful of areas, so it always
// takes that path; climbs.large-area.test.ts covers the other (sort-index)
// path.

let db: Database;

beforeEach(async () => {
  db = createDb(env.DB);
  await resetDb(db);
  await seedFixtureTree(db);
  await seedSortSends();
});

async function seedSortSends() {
  // A user can only send a given climb once (sends.user_id/climb_id is
  // unique), so each send below needs its own distinct user.
  for (let i = 1; i <= 6; i += 1) {
    await seedFixtureUser(db, {
      id: `test-user-climbs-sort-${i}`,
      name: `Climbs Sort Tester ${i}`,
    });
  }

  // Test Slab (climb 2): 2 sends, ratings 5 and 3 -> avg 4.
  await seedFixtureSend(db, {
    userId: "test-user-climbs-sort-1",
    climbId: 2,
    dateSent: "2026-01-01",
    rating: 5,
  });
  await seedFixtureSend(db, {
    userId: "test-user-climbs-sort-2",
    climbId: 2,
    dateSent: "2026-01-02",
    rating: 3,
  });
  // Test Highball (climb 1): 1 send, no rating.
  await seedFixtureSend(db, {
    userId: "test-user-climbs-sort-3",
    climbId: 1,
    dateSent: "2026-01-03",
  });
  // Test Crimper (climb 3): 3 sends, only one rated (1).
  await seedFixtureSend(db, {
    userId: "test-user-climbs-sort-4",
    climbId: 3,
    dateSent: "2026-01-04",
  });
  await seedFixtureSend(db, {
    userId: "test-user-climbs-sort-5",
    climbId: 3,
    dateSent: "2026-01-05",
  });
  await seedFixtureSend(db, {
    userId: "test-user-climbs-sort-6",
    climbId: 3,
    dateSent: "2026-01-06",
    rating: 1,
  });
  // Test Crack (climb 4): no sends at all.
}

describe("getClimb", () => {
  it("searches the selected subtree without matching an identically named area", async () => {
    await db.insert(areas).values({ id: 20, name: "Test Boulders" });
    await db.insert(climbs).values({ id: 20, areaId: 20, name: "Test Duplicate", type: "boulder" });
    const params = { name: "Test", areaId: 2, disciplines: [] };
    const result = await searchClimbs(db, params);
    expect(result.climbs.map((climb) => climb.id).sort((a, b) => a - b)).toEqual([1, 2]);
    expect(await countSearchClimbs(db, params)).toBe(2);
    expect(
      (await searchClimbs(db, { ...params, areaId: 3 })).climbs
        .map((climb) => climb.id)
        .sort((a, b) => a - b),
    ).toEqual([3, 4]);
    expect((await searchClimbs(db, { ...params, areaId: 0 })).climbs).toEqual([]);
  });
  it("returns the climb for a known id", async () => {
    const climb = await getClimb(db, 1);
    expect(climb?.name).toBe("Test Highball");
  });

  it("returns undefined for an unknown id", async () => {
    const climb = await getClimb(db, 999999);
    expect(climb).toBeUndefined();
  });
});

describe("hasClimbsInArea", () => {
  it("returns true for an area with climbs directly in it", async () => {
    expect(await hasClimbsInArea(db, 3)).toBe(true); // Test Sport Wall
  });

  it("returns false for an area with no climbs of its own, even if its sub-areas have some", async () => {
    expect(await hasClimbsInArea(db, 2)).toBe(false); // Test Boulders — climbs live on its children
  });

  it("returns false for a leaf area with no climbs", async () => {
    expect(await hasClimbsInArea(db, 1)).toBe(false); // Test Crag itself has no direct climbs
  });
});

describe("getSubtreeClimbs", () => {
  it("returns every climb in the full subtree, not just direct climbs", async () => {
    const root = await getArea(db, 1);
    const { climbs } = await getSubtreeClimbs(db, root!);
    expect(climbs.map((c) => c.name).sort()).toEqual([
      "Test Crack",
      "Test Crimper",
      "Test Highball",
      "Test Slab",
    ]);
  });

  it("finds climbs attached only to descendants, for an area with no direct climbs", async () => {
    const boulders = await getArea(db, 2);
    const { climbs } = await getSubtreeClimbs(db, boulders!);
    expect(climbs.map((c) => c.name).sort()).toEqual(["Test Highball", "Test Slab"]);
  });

  it("finds climbs directly attached to a leaf area", async () => {
    const sportWall = await getArea(db, 3);
    const { climbs } = await getSubtreeClimbs(db, sportWall!);
    expect(climbs.map((c) => c.name).sort()).toEqual(["Test Crack", "Test Crimper"]);
  });

  describe("sort", () => {
    it("sorts alphabetically by name ascending", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "name_asc");
      expect(climbs.map((c) => c.name)).toEqual([
        "Test Crack",
        "Test Crimper",
        "Test Highball",
        "Test Slab",
      ]);
    });

    it("sorts alphabetically by name descending", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "name_desc");
      expect(climbs.map((c) => c.name)).toEqual([
        "Test Slab",
        "Test Highball",
        "Test Crimper",
        "Test Crack",
      ]);
    });

    it("sorts by grade ascending", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "grade_asc");
      expect(climbs.map((c) => c.name)).toEqual([
        "Test Slab", // grade 2
        "Test Highball", // grade 5
        "Test Crack", // grade 6
        "Test Crimper", // grade 10
      ]);
    });

    it("sorts by grade descending", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "grade_desc");
      expect(climbs.map((c) => c.name)).toEqual([
        "Test Crimper",
        "Test Crack",
        "Test Highball",
        "Test Slab",
      ]);
    });

    it("sorts by rating ascending, with unrated climbs last (ties broken by name)", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "rating_asc");
      expect(climbs.map((c) => c.name)).toEqual([
        "Test Crimper", // avg 1
        "Test Slab", // avg 4
        // Both unrated — the deterministic tie-break chain (name first)
        // orders them alphabetically, not by insertion id.
        "Test Crack",
        "Test Highball",
      ]);
    });

    it("sorts by rating descending, with unrated climbs last (ties broken by name)", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "rating_desc");
      expect(climbs.map((c) => c.name)).toEqual([
        "Test Slab", // avg 4
        "Test Crimper", // avg 1
        "Test Crack",
        "Test Highball",
      ]);
    });

    it("sorts by ascent count ascending, treating no sends as zero (not last-via-null)", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "ascents_asc");
      expect(climbs.map((c) => c.name)).toEqual([
        "Test Crack", // 0 sends
        "Test Highball", // 1 send
        "Test Slab", // 2 sends
        "Test Crimper", // 3 sends
      ]);
    });

    it("sorts by ascent count descending — the page's default sort", async () => {
      const root = await getArea(db, 1);
      const explicit = await getSubtreeClimbs(db, root!, 1, "ascents_desc");
      const usingDefault = await getSubtreeClimbs(db, root!);
      const expected = ["Test Crimper", "Test Slab", "Test Highball", "Test Crack"];
      expect(explicit.climbs.map((c) => c.name)).toEqual(expected);
      expect(usingDefault.climbs.map((c) => c.name)).toEqual(expected);
    });

    it("gathers by area_id, not the sort-column index, for a small area", async () => {
      const plans = await explainQueries(db, async () =>
        getSubtreeClimbs(db, { ...(await getArea(db, 1))!, largeSubtree: false }),
      );
      expect(plans).toHaveLength(1);
      const [plan] = plans;
      const details = plan.map((row) => row.detail);
      // Small subtree: gather the candidates and sort them, rather than
      // scanning a global sort index hunting for the few that match.
      expect(details.some((d) => d.includes("climbs_area_idx"))).toBe(true);
      expect(details.some((d) => d.includes("climbs_send_count_desc_idx"))).toBe(false);
    });
  });

  describe("filter", () => {
    // Test Highball: boulder, grade 5. Test Slab: boulder, grade 2.
    // Test Crimper: sport, grade 10. Test Crack: trad, grade 6.
    it("returns every climb when no disciplines are checked", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "ascents_desc", { disciplines: [] });
      expect(climbs.map((c) => c.name).sort()).toEqual([
        "Test Crack",
        "Test Crimper",
        "Test Highball",
        "Test Slab",
      ]);
    });

    it("filters down to a single checked discipline", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "ascents_desc", {
        disciplines: ["boulder"],
        boulderRange: [0, 20],
      });
      expect(climbs.map((c) => c.name).sort()).toEqual(["Test Highball", "Test Slab"]);
    });

    it("excludes climbs outside the checked discipline's grade range", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "ascents_desc", {
        disciplines: ["boulder"],
        boulderRange: [0, 3],
      });
      expect(climbs.map((c) => c.name)).toEqual(["Test Slab"]);
    });

    it("filters by multiple disciplines independently, excluding the unchecked one", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "ascents_desc", {
        disciplines: ["boulder", "trad"],
        boulderRange: [0, 20],
        tradRange: [0, 20],
      });
      expect(climbs.map((c) => c.name).sort()).toEqual([
        "Test Crack",
        "Test Highball",
        "Test Slab",
      ]);
    });

    it("fuzzy-matches by partial climb name", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "ascents_desc", {
        disciplines: [],
        name: "Crim",
      });
      expect(climbs.map((c) => c.name)).toEqual(["Test Crimper"]);
    });

    it("combines a name search with a discipline/grade filter", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "ascents_desc", {
        disciplines: ["boulder"],
        boulderRange: [0, 20],
        name: "Test",
      });
      expect(climbs.map((c) => c.name).sort()).toEqual(["Test Highball", "Test Slab"]);
    });

    it("returns nothing when the name matches no climb", async () => {
      const root = await getArea(db, 1);
      const { climbs, hasNextPage } = await getSubtreeClimbs(db, root!, 1, "ascents_desc", {
        disciplines: [],
        name: "NoSuchClimbNameAtAll",
      });
      expect(climbs).toEqual([]);
      expect(hasNextPage).toBe(false);
    });

    // Reuses the ratings/ascent counts seeded in the "sort" describe above:
    // Slab (2 sends, avg 4), Highball (1 send, unrated), Crimper (3 sends,
    // avg 1), Crack (0 sends, unrated).
    it("filters by minimum ascent count", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "ascents_desc", {
        disciplines: [],
        minAscents: 2,
      });
      expect(climbs.map((c) => c.name).sort()).toEqual(["Test Crimper", "Test Slab"]);
    });

    it("filters by rating range, excluding unrated climbs and climbs outside the range", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "ascents_desc", {
        disciplines: [],
        ratingRange: [3, 5],
      });
      expect(climbs.map((c) => c.name)).toEqual(["Test Slab"]);
    });

    it("treats the default rating range as no filter at all, keeping unrated climbs", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "ascents_desc", {
        disciplines: [],
        ratingRange: [0, 5],
      });
      expect(climbs).toHaveLength(4);
    });

    it('returns every climb for an "Any"–"Any" rating range (0 = unbounded), not zero results', async () => {
      // Regression: "Any" as the max used to reach the query as 0, turning
      // the filter into `avg_rating BETWEEN 0 AND 0` — zero results.
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "ascents_desc", {
        disciplines: [],
        ratingRange: [0, 0],
      });
      expect(climbs).toHaveLength(4);
    });

    it('applies only the lower bound when the max is "Any" (0)', async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "ascents_desc", {
        disciplines: [],
        ratingRange: [3, 0],
      });
      expect(climbs.map((c) => c.name)).toEqual(["Test Slab"]); // avg 4
    });

    it('applies only the upper bound when the min is "Any" (0), still excluding unrated climbs', async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "ascents_desc", {
        disciplines: [],
        ratingRange: [0, 3],
      });
      expect(climbs.map((c) => c.name)).toEqual(["Test Crimper"]); // avg 1
    });

    it("combines a min-ascents filter with a discipline filter", async () => {
      const root = await getArea(db, 1);
      const { climbs } = await getSubtreeClimbs(db, root!, 1, "ascents_desc", {
        disciplines: ["boulder"],
        boulderRange: [0, 20],
        minAscents: 2,
      });
      expect(climbs.map((c) => c.name)).toEqual(["Test Slab"]);
    });
  });
});

describe("getSubtreeGradeHistogram", () => {
  // Fixture grades: Test Highball boulder/5, Test Slab boulder/2,
  // Test Crimper sport/10, Test Crack trad/6 — all under root area 1.
  it("counts climbs per (type, grade) across the whole subtree", async () => {
    const root = await getArea(db, 1);
    const rows = await getSubtreeGradeHistogram(db, root!);
    const byKey = Object.fromEntries(rows.map((r) => [`${r.type}/${r.grade}`, r.count]));
    expect(byKey["boulder/5"]).toBe(1);
    expect(byKey["boulder/2"]).toBe(1);
    expect(byKey["sport/10"]).toBe(1);
    expect(byKey["trad/6"]).toBe(1);
    expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(4);
  });

  it("scopes to the given subtree, not the whole table", async () => {
    const sportWall = await getArea(db, 3); // holds Test Crimper + Test Crack
    const rows = await getSubtreeGradeHistogram(db, sportWall!);
    expect(rows.sort((a, b) => a.type.localeCompare(b.type))).toEqual([
      { type: "sport", grade: 10, count: 1 },
      { type: "trad", grade: 6, count: 1 },
    ]);
  });

  it("reaches its climbs through the area index, not a table scan", async () => {
    const root = await getArea(db, 1);
    const plans = await explainQueries(db, async () => getSubtreeGradeHistogram(db, root!));
    expect(plans).toHaveLength(1);
    const [plan] = plans;
    expect(plan.some((row) => row.detail.includes("climbs_area_idx"))).toBe(true);
    expect(plan.every((row) => !row.detail.startsWith("SCAN climbs"))).toBe(true);
  });
});

describe("searchClimbs", () => {
  it("matches by climb name", async () => {
    const { climbs } = await searchClimbs(db, { name: "Crimper", disciplines: [] });
    expect(climbs.map((c) => c.name)).toEqual(["Test Crimper"]);
  });

  it("fuzzy-matches by partial climb name", async () => {
    const { climbs } = await searchClimbs(db, { name: "Crim", disciplines: [] });
    expect(climbs.map((c) => c.name)).toEqual(["Test Crimper"]);
  });

  it("matches by area name against the climb's own area or any ancestor", async () => {
    // "Test Boulders" is an ancestor of the climbs' actual areas (the alcove/slab
    // sub-areas), not their direct area — this exercises the descendant walk
    // over parent_id, not just the exact-area match.
    const { climbs } = await searchClimbs(db, { areaName: "Boulders", disciplines: [] });
    expect(climbs.map((c) => c.name).sort()).toEqual(["Test Highball", "Test Slab"]);
  });

  it("returns an empty page when the area name matches nothing", async () => {
    const results = await searchClimbs(db, {
      areaName: "NoSuchAreaNameAtAll",
      disciplines: [],
    });
    expect(results).toEqual({ climbs: [], hasNextPage: false });
  });

  it("returns an empty page when the name has no matchable tokens", async () => {
    const results = await searchClimbs(db, { name: " ", disciplines: [] });
    expect(results).toEqual({ climbs: [], hasNextPage: false });
  });

  it("filters by a single discipline's grade range", async () => {
    const { climbs } = await searchClimbs(db, {
      disciplines: ["boulder"],
      boulderRange: [5, 5],
    });
    expect(climbs.map((c) => c.name)).toEqual(["Test Highball"]);
  });

  it("filters by both disciplines independently without interleaving", async () => {
    const { climbs } = await searchClimbs(db, {
      disciplines: ["boulder", "trad"],
      boulderRange: [5, 5],
      tradRange: [6, 6],
    });
    expect(climbs.map((c) => c.name).sort()).toEqual(["Test Crack", "Test Highball"]);
  });

  it("filters sport and trad independently by their own grade ranges", async () => {
    const { climbs } = await searchClimbs(db, {
      disciplines: ["sport", "trad"],
      sportRange: [10, 10],
      tradRange: [0, 0],
    });
    expect(climbs.map((c) => c.name)).toEqual(["Test Crimper"]);
  });

  it("excludes climbs outside the requested grade range", async () => {
    const { climbs } = await searchClimbs(db, {
      disciplines: ["boulder"],
      boulderRange: [0, 3],
    });
    expect(climbs.map((c) => c.name)).toEqual(["Test Slab"]);
  });

  it("returns a real numeric areaId, not the raw snake_case column", async () => {
    // Regression test: a raw-SQL `climbs.*` wildcard returns SQLite's actual
    // column name (`area_id`), not drizzle's camelCase `areaId` field — that
    // silently produced `undefined` here until the query explicitly aliased
    // every column.
    const { climbs } = await searchClimbs(db, { name: "Test Highball", disciplines: [] });
    expect(climbs).toHaveLength(1);
    expect(climbs[0].areaId).toBe(4); // Test Highball Alcove
  });

  // The common per-test fixture supplies: Slab (2 sends, avg 4), Highball (1 send, unrated),
  // Crimper (3 sends, avg 1), Crack (0 sends, unrated).
  it("filters by minimum ascent count", async () => {
    const { climbs } = await searchClimbs(db, { disciplines: [], minAscents: 2 });
    expect(climbs.map((c) => c.name).sort()).toEqual(["Test Crimper", "Test Slab"]);
  });

  it("filters by rating range, excluding unrated climbs and climbs outside the range", async () => {
    const { climbs } = await searchClimbs(db, { disciplines: [], ratingRange: [3, 5] });
    expect(climbs.map((c) => c.name)).toEqual(["Test Slab"]);
  });

  it('returns every climb for an "Any"–"Any" rating range (0 = unbounded), not zero results', async () => {
    // Same regression as getSubtreeClimbs: an "Any" max used to become
    // `avg_rating BETWEEN 0 AND 0` and match nothing.
    const { climbs } = await searchClimbs(db, { disciplines: [], ratingRange: [0, 0] });
    expect(climbs.map((c) => c.name).sort()).toEqual([
      "Test Crack",
      "Test Crimper",
      "Test Highball",
      "Test Slab",
    ]);
  });

  it('applies only the lower bound when the max is "Any" (0)', async () => {
    const { climbs } = await searchClimbs(db, { disciplines: [], ratingRange: [3, 0] });
    expect(climbs.map((c) => c.name)).toEqual(["Test Slab"]); // avg 4
  });

  it("defaults to sorting by ascent count descending", async () => {
    const { climbs } = await searchClimbs(db, { disciplines: [] });
    expect(climbs.map((c) => c.name)).toEqual([
      "Test Crimper", // 3 ascents
      "Test Slab", // 2 ascents
      "Test Highball", // 1 ascent
      "Test Crack", // 0 ascents
    ]);
  });

  it("sorts by an explicit field", async () => {
    const { climbs } = await searchClimbs(db, { disciplines: [], sort: "name_asc" });
    expect(climbs.map((c) => c.name)).toEqual([
      "Test Crack",
      "Test Crimper",
      "Test Highball",
      "Test Slab",
    ]);
  });

  it("doesn't choke when an area name matches far more areas than one statement's bound-parameter limit allows", async () => {
    // Regression test: area-name matching used to bind two parameters per
    // matched area, so a name matching many areas blew past D1's
    // per-statement bound-parameter limit ("Failed query" at runtime). The
    // matched areas and their descendants are now resolved by a recursive
    // walk over parent_id that binds only the name, so this must succeed
    // regardless of match count.
    const AREA_COUNT = 60;
    const startId = 90_000;
    await seedManyAreas(db, AREA_COUNT, startId);

    const climbRows = Array.from({ length: AREA_COUNT }, (_, i) => ({
      id: startId + i,
      areaId: startId + i,
      name: `Bulk Climb For Area ${i}`,
      type: "boulder" as const,
      grade: i % 19,
    }));
    // 8 bound columns per row (drizzle binds every defaulted column
    // explicitly — same count as seedManyClimbs), so chunk the insert to stay
    // under D1's bound-parameter limit.
    const CHUNK_SIZE = 10;
    for (let i = 0; i < climbRows.length; i += CHUNK_SIZE) {
      await db.insert(climbs).values(climbRows.slice(i, i + CHUNK_SIZE));
    }

    // searchClimbs returns one SEARCH_PAGE_SIZE page at a time — the point
    // here is that the query doesn't throw with 60 areas matched, not that
    // every match comes back at once.
    const { climbs: results, hasNextPage } = await searchClimbs(db, {
      areaName: "Bulk Area",
      disciplines: [],
    });
    expect(results).toHaveLength(25);
    expect(hasNextPage).toBe(true);
  });
});

// Each pagination case seeds its own area and 55 climbs.
describe("searchClimbs pagination", () => {
  const AREA_ID = 200_000;
  // Scopes every query here to just this describe's fixtures — a name unique
  // in this file, matched via areaNameCondition.
  const SCOPE = { areaName: "Paged Search Area", disciplines: [] as [] };

  beforeEach(async () => {
    await db.insert(areas).values({
      id: AREA_ID,
      parentId: null,
      name: "Paged Search Area",
    });
    await seedManyClimbs(db, AREA_ID, 55, AREA_ID);
  });

  it("returns a full page and reports hasNextPage when more rows remain", async () => {
    const page1 = await searchClimbs(db, SCOPE, 1);
    expect(page1.climbs).toHaveLength(25);
    expect(page1.hasNextPage).toBe(true);
  });

  it("returns the remainder and reports no next page on the last page", async () => {
    const page3 = await searchClimbs(db, SCOPE, 3);
    expect(page3.climbs).toHaveLength(5);
    expect(page3.hasNextPage).toBe(false);
  });

  it("supports offset pagination independently of page numbers", async () => {
    const page2 = await searchClimbs(db, SCOPE, 2, 10);
    const slice = await searchClimbs(db, SCOPE, 1, 10, 10);
    expect(slice.climbs.map((climb) => climb.id)).toEqual(
      [18, 19, 2, 20, 21, 22, 23, 24, 25, 26].map((i) => AREA_ID + i),
    );
    expect(slice).toEqual(page2);
  });

  // Every seeded climb has send_count 0 (default-sort tie) and grades of
  // `i % 19` (~3 climbs per grade) — exactly the tie-heavy shapes where a
  // missing unique tie-breaker (`climbs.id`) makes OFFSET pagination
  // duplicate or skip rows across pages.
  it("pages over fully tied climbs without duplicating or skipping any", async () => {
    for (const sort of [undefined, "grade_asc"] as const) {
      const ids: number[] = [];
      for (let page = 1; page <= 3; page += 1) {
        const result = await searchClimbs(db, { ...SCOPE, sort }, page);
        ids.push(...result.climbs.map((c) => c.id));
      }
      expect(ids).toHaveLength(55);
      expect(new Set(ids).size).toBe(55);
    }
  });

  it("counts every match, not just the first page", async () => {
    expect(await countSearchClimbs(db, SCOPE)).toBe(55);
  });

  it("counts with the same filters as the page query", async () => {
    // Grades are i % 19 over 55 climbs: each grade in [0, 4] appears 3
    // times, so a boulder range of [0, 4] matches 15.
    expect(
      await countSearchClimbs(db, {
        ...SCOPE,
        disciplines: ["boulder"],
        boulderRange: [0, 4],
      }),
    ).toBe(15);
  });

  it("counts zero for a name with no matchable tokens", async () => {
    expect(await countSearchClimbs(db, { name: " ", disciplines: [] })).toBe(0);
  });
});

async function seedTwins() {
  // Twins in different areas; only the higher-id one has been climbed.
  await db.insert(climbs).values([
    { id: 997, areaId: 5, name: "Test Twin", type: "boulder", grade: 3 },
    { id: 998, areaId: 3, name: "Test Twin", type: "sport", grade: 3 },
  ]);
  await seedFixtureUser(db, { id: "candidate-user" });
  await seedFixtureSend(db, { userId: "candidate-user", climbId: 998, dateSent: null });
}

describe("findClimbCandidatesByNames", () => {
  it("returns each climb matching a name, keyed by its folded name, with its area and ancestors", async () => {
    const results = await findClimbCandidatesByNames(db, ["Test Crimper"]);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: 3,
      key: "test crimper",
      name: "Test Crimper",
      type: "sport",
      grade: 10,
      areaId: 3,
      areaName: "Test Sport Wall",
      sendCount: 3,
      total: 1,
      ancestors: [{ id: 1, name: "Test Crag" }],
    });
  });

  it("looks up several names in one call, case-insensitively and trimmed", async () => {
    const results = await findClimbCandidatesByNames(db, ["  test crimper  ", "TEST HIGHBALL"]);
    expect(results.map((c) => [c.key, c.id])).toEqual([
      ["test crimper", 3],
      ["test highball", 1],
    ]);
    // Ancestors read root-first, the way every breadcrumb does.
    expect(results[1].ancestors.map((a) => a.name)).toEqual(["Test Crag", "Test Boulders"]);
  });

  it("returns nothing for names no climb has, and nothing at all for an empty list", async () => {
    expect(await findClimbCandidatesByNames(db, ["No Such Climb"])).toEqual([]);
    expect(await findClimbCandidatesByNames(db, [])).toEqual([]);
  });

  // Ancestors are walked upward from each climb's own area, so depth is the
  // dimension the cost scales with — and the shared fixture tree is only two
  // levels deep. This chain is its own root so it can't perturb the fixture
  // tree's subtree assertions.
  it("walks the whole ancestor chain of a deeply nested climb", async () => {
    await db.insert(areas).values([
      { id: 8000, parentId: null, name: "Test Deep Range" },
      { id: 8001, parentId: 8000, name: "Test Deep Massif" },
      { id: 8002, parentId: 8001, name: "Test Deep Valley" },
      { id: 8003, parentId: 8002, name: "Test Deep Buttress" },
    ]);
    await db.insert(climbs).values({
      id: 8100,
      areaId: 8003,
      name: "Test Deep Route",
      type: "trad",
      grade: 7,
    });

    const [result] = await findClimbCandidatesByNames(db, ["Test Deep Route"]);
    expect(result.areaName).toBe("Test Deep Buttress");
    expect(result.ancestors.map((a) => a.name)).toEqual([
      "Test Deep Range",
      "Test Deep Massif",
      "Test Deep Valley",
    ]);
  });

  it("returns every same-named climb under one key, most-ascended first", async () => {
    await seedTwins();

    const results = await findClimbCandidatesByNames(db, ["Test Twin"]);
    expect(results.map((c) => c.id)).toEqual([998, 997]);
    expect(results.map((c) => c.total)).toEqual([2, 2]);
    expect(results.map((c) => c.key)).toEqual(["test twin", "test twin"]);
  });

  it("caps each name at CLIMB_CANDIDATES_PER_NAME while reporting the true total", async () => {
    const count = CLIMB_CANDIDATES_PER_NAME + 5;
    const rows = Array.from({ length: count }, (_, i) => ({
      id: 8200 + i,
      areaId: 5,
      name: "Test Common Name",
      type: "boulder" as const,
      grade: i % 5,
    }));
    // Chunked for D1's bound-parameter cap, as seedManyClimbs does.
    for (let i = 0; i < rows.length; i += 10) {
      await db.insert(climbs).values(rows.slice(i, i + 10));
    }

    const results = await findClimbCandidatesByNames(db, ["Test Common Name"]);
    expect(results).toHaveLength(CLIMB_CANDIDATES_PER_NAME);
    expect(results.every((c) => c.total === count)).toBe(true);
    // Ties on ascent count fall back to id, so the cut is deterministic.
    expect(results.map((c) => c.id)).toEqual(
      Array.from({ length: CLIMB_CANDIDATES_PER_NAME }, (_, i) => 8200 + i),
    );
  });
});

describe("findClimbCandidatesInAreas", () => {
  it("matches a climb by its own area or any ancestor, never an unrelated area", async () => {
    // Test Highball is climb 1 in Test Highball Alcove (4) under Test Boulders (2) under Test Crag (1).
    const own = await findClimbCandidatesInAreas(db, [
      { name: "test highball", areaName: " TEST HIGHBALL ALCOVE " },
    ]);
    expect(own.map((c) => c.id)).toEqual([1]);

    const [byAncestor] = await findClimbCandidatesInAreas(db, [
      { name: "Test Highball", areaName: "Test Crag" },
    ]);
    expect(byAncestor.id).toBe(1);
    expect(byAncestor.key).toBe("test highball");
    expect(byAncestor.areaName).toBe("Test Highball Alcove");
    expect(byAncestor.ancestors.map((a) => a.name)).toEqual(["Test Crag", "Test Boulders"]);

    const unrelated = await findClimbCandidatesInAreas(db, [
      { name: "Test Highball", areaName: "Test Sport Wall" },
    ]);
    expect(unrelated).toEqual([]);
  });

  it("returns only the paired area's twin while counting every climb of the name", async () => {
    await seedTwins();
    const results = await findClimbCandidatesInAreas(db, [
      { name: "Test Twin", areaName: "Test Slab Area" },
      { name: "No Such Climb", areaName: "Test Crag" },
    ]);
    expect(results.map((c) => c.id)).toEqual([997]);
    expect(results[0].total).toBe(2);
  });

  it("returns nothing for an empty list", async () => {
    expect(await findClimbCandidatesInAreas(db, [])).toEqual([]);
  });
});

describe("getClimbsByIds", () => {
  it("returns the requested climbs and silently drops unknown ids", async () => {
    const results = await getClimbsByIds(db, [3, 1, 424242, 3]);
    expect(results.map((c) => c.id).sort((a, b) => a - b)).toEqual([1, 3]);
    expect(results.find((c) => c.id === 3)).toEqual({
      id: 3,
      areaId: 3,
      name: "Test Crimper",
      type: "sport",
      grade: 10,
    });
  });

  it("returns nothing for an empty list without querying", async () => {
    expect(await getClimbsByIds(db, [])).toEqual([]);
  });
});

describe("getAreaWithSubtreeSize", () => {
  it("returns the same area fields as getArea", async () => {
    const plain = await getArea(db, 2); // Test Boulders
    const withSize = await getAreaWithSubtreeSize(db, 2);
    expect(withSize).toEqual({ ...plain!, largeSubtree: false });
    // parentId specifically: this selects through drizzle's column spread, and
    // a regression to a raw `areas.*` would hand back `parent_id` instead,
    // leaving this undefined while every other assertion still passed.
    expect(withSize?.parentId).toBe(1);
  });

  it("returns undefined for an unknown id", async () => {
    expect(await getAreaWithSubtreeSize(db, 999999)).toBeUndefined();
  });

  // The carried signal and the standalone probe are two independent
  // implementations of the same predicate, so they can disagree; passing the
  // richer row must not change what comes back.
  it("gives getSubtreeClimbs the same answer as its own probe", async () => {
    const carried = await getAreaWithSubtreeSize(db, 1);
    const plain = await getArea(db, 1);
    expect(await getSubtreeClimbs(db, carried!, 1, "name_asc")).toEqual(
      await getSubtreeClimbs(db, plain!, 1, "name_asc"),
    );
  });

  // Pinned from both sides rather than only observing `false` on the small
  // fixture tree: the threshold's failure mode is silent. An off-by-one
  // between the probe's LIMIT and its comparison doesn't throw — it just
  // reports every area as small and quietly hands back the slow query plan
  // for the areas that most need the fast one. Seeded under its own root so
  // it can't perturb the fixture tree's subtree assertions.
  it("flips to largeSubtree exactly at LARGE_AREA_SUBTREE_AREAS", async () => {
    // 700_000+ because 200_000 is the paged-search fixture's area above.
    const ROOT_ID = 700_000;
    await db.insert(areas).values({ id: ROOT_ID, parentId: null, name: "Wide Root" });
    // The root counts toward its own subtree, so this leaves it one short.
    await seedManyAreas(db, LARGE_AREA_SUBTREE_AREAS - 2, ROOT_ID + 1, {
      parentId: ROOT_ID,
      namePrefix: "Wide Area",
    });
    expect((await getAreaWithSubtreeSize(db, ROOT_ID))?.largeSubtree).toBe(false);

    await db.insert(areas).values({ id: ROOT_ID - 1, parentId: ROOT_ID, name: "Wide Area last" });
    expect((await getAreaWithSubtreeSize(db, ROOT_ID))?.largeSubtree).toBe(true);
  });
});

it.each(["search", "area"])(
  "%s keeps SQL-null ratings in the full displayed range only",
  async (surface) => {
    const stored = await db.select({ name: climbs.name, rating: climbs.avgRating }).from(climbs);
    expect(stored).toEqual(
      expect.arrayContaining([
        { name: "Test Highball", rating: null },
        { name: "Test Crack", rating: null },
      ]),
    );
    const root = await getArea(db, 1);
    const query = (ratingRange: [number, number]) =>
      surface === "search"
        ? searchClimbs(db, { disciplines: [], ratingRange })
        : getSubtreeClimbs(db, root!, 1, "ascents_desc", { disciplines: [], ratingRange });
    expect((await query([1, 5])).climbs.map((climb) => climb.name).sort()).toEqual([
      "Test Crack",
      "Test Crimper",
      "Test Highball",
      "Test Slab",
    ]);
    expect((await query([1, 3])).climbs.map((climb) => climb.name)).toEqual(["Test Crimper"]);
  },
);
