import { env } from "cloudflare:test";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { seedFixtureTree } from "@/test/fixtures";
import { explainQueries } from "@/test/query-plans";
import { resetDb } from "@/test/reset-db";

import { searchClimbs } from "./climbs";

// A nameless climb search has no FTS narrowing, so it must read the sort
// index in order and stop at LIMIT instead of sorting the catalog. SQLite
// picks one plan per SQL shape, so these plans are the production plans.
const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
});

const details = (plan: { detail: string }[]) => plan.map((row) => row.detail).join("\n");

it("browses the catalog through the sort index without a temporary sort", async () => {
  const [plan] = await explainQueries(db, () =>
    searchClimbs(db, { disciplines: [], sort: "rating_desc" }),
  );
  expect(details(plan)).toContain("climbs_avg_rating_desc_idx");
  expect(details(plan)).not.toContain("TEMP B-TREE FOR ORDER BY");
  // Ties fall back to id on this path; every fixture climb has zero sends.
  const { climbs } = await searchClimbs(db, { disciplines: [], sort: "ascents_desc" });
  expect(climbs.map((climb) => climb.id)).toEqual([1, 2, 3, 4]);
});

it("keeps FTS and the full tie-break ordering once a name narrows the set", async () => {
  const [plan] = await explainQueries(db, () =>
    searchClimbs(db, { disciplines: [], name: "Test", sort: "ascents_desc" }),
  );
  expect(details(plan)).toContain("climbs_fts");
  expect(details(plan)).not.toContain("climbs_send_count_desc_idx");
  const { climbs } = await searchClimbs(db, {
    disciplines: [],
    name: "Test",
    sort: "ascents_desc",
  });
  expect(climbs.map((climb) => climb.name)).toEqual([
    "Test Crack",
    "Test Crimper",
    "Test Highball",
    "Test Slab",
  ]);
});

it("sorts a small area's nameless list by the full tie-break instead of the sort index", async () => {
  const plans = await explainQueries(db, () =>
    searchClimbs(db, { disciplines: [], areaId: 1, sort: "ascents_desc" }),
  );
  // The subtree-size probe runs first; the list query is last.
  expect(details(plans.at(-1)!)).not.toContain("climbs_send_count_desc_idx");
  const { climbs } = await searchClimbs(db, { disciplines: [], areaId: 3, sort: "ascents_desc" });
  expect(climbs.map((climb) => climb.name)).toEqual(["Test Crack", "Test Crimper"]);
});
