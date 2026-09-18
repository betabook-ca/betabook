import { describe, expect, it } from "vitest";

import {
  buildAncestorPaths,
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
