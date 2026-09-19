import { describe, expect, it } from "vitest";

import {
  buildAncestorPaths,
  descendantsOf,
  indexAreasByParent,
  indexClimbsByArea,
  type AreaRow,
} from "./snapshot.ts";
import type { BetabookAreaCandidate, BetabookClimbCandidate } from "./types.ts";

function areaRow(overrides: Partial<AreaRow> & { id: number }): AreaRow {
  return { parent_id: null, name: "Area", latitude: null, longitude: null, ...overrides };
}

describe("buildAncestorPaths", () => {
  it("returns an empty path for a root area", () => {
    const rows = [areaRow({ id: 1, name: "Test Crag" })];
    expect(buildAncestorPaths(rows).get(1)).toEqual([]);
  });

  it("builds a root-first path for a nested area", () => {
    const rows = [
      areaRow({ id: 1, name: "Test Crag" }),
      areaRow({ id: 2, parent_id: 1, name: "Test Boulders" }),
      areaRow({ id: 4, parent_id: 2, name: "Test Highball Alcove" }),
    ];
    expect(buildAncestorPaths(rows).get(4)).toEqual(["Test Crag", "Test Boulders"]);
  });

  it("memoizes shared ancestors instead of re-walking them per descendant", () => {
    const rows = [
      areaRow({ id: 1, name: "Test Crag" }),
      areaRow({ id: 2, parent_id: 1, name: "Test Boulders" }),
      areaRow({ id: 4, parent_id: 2, name: "Test Highball Alcove" }),
      areaRow({ id: 5, parent_id: 2, name: "Test Slab Area" }),
    ];
    const paths = buildAncestorPaths(rows);
    expect(paths.get(4)).toEqual(["Test Crag", "Test Boulders"]);
    expect(paths.get(5)).toEqual(["Test Crag", "Test Boulders"]);
  });

  it("stops cleanly at a dangling parent reference", () => {
    const rows = [areaRow({ id: 4, parent_id: 999999, name: "Orphaned" })];
    expect(buildAncestorPaths(rows).get(4)).toEqual([]);
  });
});

describe("indexAreasByParent", () => {
  it("groups areas under their direct parent, including root areas under null", () => {
    const root: BetabookAreaCandidate = {
      id: 1,
      name: "Test Crag",
      parentId: null,
      latitude: null,
      longitude: null,
      ancestors: [],
    };
    const child: BetabookAreaCandidate = {
      id: 2,
      name: "Test Boulders",
      parentId: 1,
      latitude: null,
      longitude: null,
      ancestors: ["Test Crag"],
    };
    const index = indexAreasByParent([root, child]);
    expect(index.get(null)).toEqual([root]);
    expect(index.get(1)).toEqual([child]);
  });
});

describe("descendantsOf", () => {
  function area(overrides: Partial<BetabookAreaCandidate> & { id: number }): BetabookAreaCandidate {
    return {
      name: "Area",
      parentId: null,
      latitude: null,
      longitude: null,
      ancestors: [],
      ...overrides,
    };
  }

  it("returns grandchildren and great-grandchildren, not just direct children", () => {
    const country = area({ id: 1, name: "Country" });
    const state = area({ id: 2, name: "State", parentId: 1 });
    const crag = area({ id: 3, name: "Crag", parentId: 2 });
    const wall = area({ id: 4, name: "Wall", parentId: 3 });
    const index = indexAreasByParent([country, state, crag, wall]);
    expect(
      descendantsOf(1, index)
        .map((a) => a.id)
        .sort((a, b) => a - b),
    ).toEqual([2, 3, 4]);
  });

  it("returns an empty array for a leaf with no children", () => {
    const leaf = area({ id: 5, name: "Leaf" });
    const index = indexAreasByParent([leaf]);
    expect(descendantsOf(5, index)).toEqual([]);
  });

  it("returns an empty array for an id absent from the index", () => {
    const index = indexAreasByParent([area({ id: 1 })]);
    expect(descendantsOf(999999, index)).toEqual([]);
  });
});

describe("indexClimbsByArea", () => {
  it("groups climbs under their area", () => {
    const climb: BetabookClimbCandidate = {
      id: 1,
      name: "Test Highball",
      type: "boulder",
      grade: 5,
      areaId: 4,
      latitude: null,
      longitude: null,
    };
    const index = indexClimbsByArea([climb]);
    expect(index.get(4)).toEqual([climb]);
    expect(index.get(999999)).toBeUndefined();
  });
});
