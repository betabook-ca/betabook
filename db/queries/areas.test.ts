import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, type Database } from "@/db/client";
import { areas } from "@/db/schema";
import { seedFixtureTree, seedManyAreas } from "@/test/fixtures";

import { getAncestors, getArea, getAreaBreadcrumbs, getSubareas, searchAreas } from "./areas";

let db: Database;

beforeAll(async () => {
  db = createDb(env.DB);
  await seedFixtureTree(db);
});

describe("getArea", () => {
  it("returns the area for a known id", async () => {
    const area = await getArea(db, 1);
    expect(area?.name).toBe("Test Crag");
  });

  it("returns undefined for an unknown id", async () => {
    const area = await getArea(db, 999999);
    expect(area).toBeUndefined();
  });
});

describe("getSubareas", () => {
  it("returns only direct children, not grandchildren", async () => {
    const subareas = await getSubareas(db, 1);
    expect(subareas.map((a) => a.name).sort()).toEqual(["Test Boulders", "Test Sport Wall"]);
  });

  it("returns an empty array for a leaf area", async () => {
    const subareas = await getSubareas(db, 3);
    expect(subareas).toEqual([]);
  });

  // Neither SQLite collation orders a worldwide area list correctly: BINARY
  // puts every lowercase initial after every uppercase one, and NOCASE folds
  // only ASCII A-Z, so it sorts accented names after `Z`. Against the real
  // dataset NOCASE misplaced 2,623 of 10,230 areas and BINARY 3,436 — almost
  // all of them non-ASCII names buried at the bottom of their sibling list.
  it("sorts accented and lowercase names alphabetically, not after Z", async () => {
    await db.insert(areas).values([
      { id: 700, parentId: null, name: "Collation Root" },
      { id: 701, parentId: 700, name: "Datca" },
      { id: 702, parentId: 700, name: "Çitdibi" },
      { id: 703, parentId: 700, name: "Zebra Wall" },
      { id: 704, parentId: 700, name: "aardvark ledge" },
      { id: 705, parentId: 700, name: "Črni kal" },
    ]);

    const names = (await getSubareas(db, 700)).map((a) => a.name);
    expect(names).toEqual(["aardvark ledge", "Çitdibi", "Črni kal", "Datca", "Zebra Wall"]);
  });
});

describe("getAncestors", () => {
  it("returns an empty array for the root area", async () => {
    const root = await getArea(db, 1);
    const ancestors = await getAncestors(db, root!);
    expect(ancestors).toEqual([]);
  });

  it("returns the full root-first chain for a two-level-deep area", async () => {
    const alcove = await getArea(db, 4);
    const ancestors = await getAncestors(db, alcove!);
    expect(ancestors.map((a) => a.name)).toEqual(["Test Crag", "Test Boulders"]);
    expect(ancestors.map((a) => a.parentId)).toEqual([null, 1]);
  });

  it("returns exactly one ancestor for a one-level-deep area", async () => {
    const sportWall = await getArea(db, 3);
    const ancestors = await getAncestors(db, sportWall!);
    expect(ancestors.map((a) => a.name)).toEqual(["Test Crag"]);
  });
});

describe("getAreaBreadcrumbs", () => {
  it("returns nearest-ancestor breadcrumbs keyed by distinct area ids", async () => {
    const breadcrumbs = await getAreaBreadcrumbs(db, [4, 3, 4]);
    expect(breadcrumbs[4].map((a) => a.name)).toEqual(["Test Crag", "Test Boulders"]);
    expect(breadcrumbs[3].map((a) => a.name)).toEqual(["Test Crag"]);
    expect(Object.keys(breadcrumbs)).toHaveLength(2);
  });

  it("omits unknown area ids rather than throwing", async () => {
    const breadcrumbs = await getAreaBreadcrumbs(db, [999999]);
    expect(breadcrumbs).toEqual({});
  });

  it("returns an empty array (not an omitted key) for an area with no ancestors", async () => {
    const breadcrumbs = await getAreaBreadcrumbs(db, [1]);
    expect(breadcrumbs[1]).toEqual([]);
    expect(Object.keys(breadcrumbs)).toHaveLength(1);
  });

  it("handles sibling areas independently", async () => {
    const breadcrumbs = await getAreaBreadcrumbs(db, [2, 3]);
    expect(breadcrumbs[2].map((a) => a.name)).toEqual(["Test Crag"]);
    expect(breadcrumbs[3].map((a) => a.name)).toEqual(["Test Crag"]);
  });

  it("respects a custom depth", async () => {
    const breadcrumbs = await getAreaBreadcrumbs(db, [4], 1);
    expect(breadcrumbs[4].map((a) => a.name)).toEqual(["Test Boulders"]);
  });

  it("returns an empty result for an empty input array", async () => {
    const breadcrumbs = await getAreaBreadcrumbs(db, []);
    expect(breadcrumbs).toEqual({});
  });

  it("handles a 200-area API/export batch without exceeding D1's bind limit", async () => {
    const startId = 410_000;
    await seedManyAreas(db, 200, startId, {
      parentId: 1,
      namePrefix: "Breadcrumb Batch Area",
    });
    const ids = Array.from({ length: 200 }, (_, index) => startId + index);

    const breadcrumbs = await getAreaBreadcrumbs(db, ids);

    expect(Object.keys(breadcrumbs)).toHaveLength(200);
    expect(breadcrumbs[startId]).toEqual([{ id: 1, name: "Test Crag" }]);
    expect(breadcrumbs[startId + 199]).toEqual([{ id: 1, name: "Test Crag" }]);
  });
});

describe("searchAreas", () => {
  it("fuzzy-matches on partial area name", async () => {
    const { areas } = await searchAreas(db, "Bould");
    expect(areas.map((a) => a.name)).toContain("Test Boulders");
  });

  it("does not throw on FTS5 query-syntax characters in the input", async () => {
    const { areas } = await searchAreas(db, 'Boulders"');
    expect(areas.map((a) => a.name)).toContain("Test Boulders");
  });

  it("returns an empty page when nothing matches", async () => {
    const results = await searchAreas(db, "NoSuchAreaNameAtAll");
    expect(results).toEqual({ areas: [], hasNextPage: false });
  });

  // Load-bearing for every rendered ancestor path (see toBreadcrumbPath):
  // GROUP_CONCAT concatenates rows in the order it receives them, so the
  // ordering lives in the subquery feeding it — an ORDER BY beside the
  // aggregate itself would order the single output row and silently leave
  // the sequence to the scan.
  it("builds ancestorPath root-first", async () => {
    const { areas } = await searchAreas(db, "Highball Alcove");
    expect(areas[0]?.ancestorPath).toBe("Test Crag > Test Boulders");
    expect(areas[0]?.parentId).toBe(2);
  });

  it("leaves ancestorPath null for a root area", async () => {
    const { areas } = await searchAreas(db, "Test Crag");
    expect(areas.find((a) => a.name === "Test Crag")?.ancestorPath).toBeNull();
  });
});

// Placed last in the file: this seeds 30 more areas, which would otherwise
// bleed into the exact-match expectations above.
describe("searchAreas pagination", () => {
  beforeAll(async () => {
    // 30 areas sharing a name prefix — more than one AREA_SEARCH_PAGE_SIZE
    // (25) page, and near-identical names share a bm25 rank, so only the
    // areas.id tie-breaker gives OFFSET pagination a defined order.
    await seedManyAreas(db, 30, 300_000);
  });

  it("returns a full page and reports hasNextPage when more rows remain", async () => {
    const page1 = await searchAreas(db, "Bulk Area", 1);
    expect(page1.areas).toHaveLength(25);
    expect(page1.hasNextPage).toBe(true);
  });

  it("returns the remainder and reports no next page on the last page", async () => {
    const page2 = await searchAreas(db, "Bulk Area", 2);
    expect(page2.areas).toHaveLength(5);
    expect(page2.hasNextPage).toBe(false);
  });

  it("pages over rank-tied areas without duplicating or skipping any", async () => {
    const page1 = await searchAreas(db, "Bulk Area", 1);
    const page2 = await searchAreas(db, "Bulk Area", 2);
    const ids = [...page1.areas, ...page2.areas].map((a) => a.id);
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
  });

  // Index repair can leave an orphan; search must not return a missing area.
  it("ignores an orphaned index row the search itself cannot return", async () => {
    await db.run(sql`INSERT INTO areas_fts(rowid, name) VALUES (987654, 'Orphaned Ghost Area')`);
    const page = await searchAreas(db, "Orphaned Ghost Area");
    expect(page.areas).toHaveLength(0);
  });
});
