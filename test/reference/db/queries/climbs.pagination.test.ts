import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, type Database } from "@/db/client";
import { areas } from "@/db/schema";
import { seedManyClimbs } from "@/test/fixtures";

import { getArea } from "./areas";
import { getSubtreeClimbs } from "./climbs";

// Isolated from climbs.test.ts's fixture tree on purpose: searchClimbs there
// searches globally (no area scoping), so bulk climbs from a pagination test
// would otherwise leak into and break those tests' expected result sets.

let db: Database;

beforeAll(async () => {
  db = createDb(env.DB);
  await db.insert(areas).values({
    id: 1,
    parentId: null,
    name: "Pagination Test Area",
  });
  await seedManyClimbs(db, 1, 55, 1000);
});

describe("getSubtreeClimbs pagination", () => {
  it("returns a full page and reports hasNextPage when more rows remain", async () => {
    const area = await getArea(db, 1);
    const page1 = await getSubtreeClimbs(db, area!, 1);
    expect(page1.climbs.length).toBe(50);
    expect(page1.hasNextPage).toBe(true);
  });

  it("returns the remainder and reports no next page on the last page", async () => {
    const area = await getArea(db, 1);
    const page2 = await getSubtreeClimbs(db, area!, 2);
    expect(page2.climbs.length).toBe(5);
    expect(page2.hasNextPage).toBe(false);
  });

  it("supports offset pagination independently of page numbers", async () => {
    const area = await getArea(db, 1);
    const page2 = await getSubtreeClimbs(db, area!, 2, "ascents_desc", undefined, 10);
    const slice = await getSubtreeClimbs(db, area!, 1, "ascents_desc", undefined, 10, 10);
    expect(slice.climbs.map((climb) => climb.id)).toEqual(
      [18, 19, 2, 20, 21, 22, 23, 24, 25, 26].map((i) => 1000 + i),
    );
    expect(slice.climbs).toEqual(page2.climbs);
    expect(slice.hasNextPage).toBe(page2.hasNextPage);
  });

  // The seeded grades are `i % 19`, so every grade is shared by ~3 climbs —
  // exactly the tie-heavy shape where a missing unique tie-breaker
  // (`climbs.id`, appended to every SUBTREE_CLIMBS_ORDER_BY variant) makes
  // OFFSET pagination duplicate or skip rows across pages.
  it("pages over climbs sharing a grade without duplicating or skipping any", async () => {
    const area = await getArea(db, 1);
    const page1 = await getSubtreeClimbs(db, area!, 1, "grade_asc");
    const page2 = await getSubtreeClimbs(db, area!, 2, "grade_asc");
    const ids = [...page1.climbs, ...page2.climbs].map((c) => c.id);
    expect(ids.length).toBe(55);
    expect(new Set(ids).size).toBe(55);
  });
});
