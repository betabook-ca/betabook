import { describe, expect, it } from "vitest";

import { findDuplicatesAmongSiblings, findInternalAreaDuplicates } from "./internal-duplicates.ts";
import type { BetabookAreaCandidate } from "./types.ts";

function area(id: number, name: string): BetabookAreaCandidate {
  return { id, name, parentId: 18, latitude: null, longitude: null, ancestors: ["Uncategorized"] };
}

describe("findDuplicatesAmongSiblings", () => {
  it("returns nothing for fewer than two siblings", () => {
    expect(findDuplicatesAmongSiblings([area(1, "Millennium")])).toEqual([]);
  });

  it("finds an exact loose-key duplicate and keeps the lowest id as the target", () => {
    const duplicates = findDuplicatesAmongSiblings([area(2, "millennium"), area(1, "Millennium")]);
    expect(duplicates).toEqual([{ sourceId: 2, targetId: 1 }]);
  });

  it("finds a near-miss spelling via the fuzzy fallback", () => {
    const duplicates = findDuplicatesAmongSiblings([area(1, "Millennium"), area(2, "Millenium")]);
    expect(duplicates).toEqual([{ sourceId: 2, targetId: 1 }]);
  });

  it("does not flag genuinely different names", () => {
    const duplicates = findDuplicatesAmongSiblings([
      area(1, "Millennium"),
      area(2, "Sandstone Wall"),
    ]);
    expect(duplicates).toEqual([]);
  });

  it("clusters three-way duplicates onto a single surviving target", () => {
    const duplicates = findDuplicatesAmongSiblings([
      area(3, "Millenium"),
      area(1, "Millennium"),
      area(2, "millennium"),
    ]);
    expect(duplicates.sort((a, b) => a.sourceId - b.sourceId)).toEqual([
      { sourceId: 2, targetId: 1 },
      { sourceId: 3, targetId: 1 },
    ]);
  });

  it("skips the fuzzy sweep above the size cap but still catches exact duplicates", () => {
    const large = Array.from({ length: 501 }, (_, i) => area(i + 1, `Unique Area ${i}`));
    large.push(area(9000, "Millennium"), area(9001, "millennium"));
    const duplicates = findDuplicatesAmongSiblings(large);
    expect(duplicates).toEqual([{ sourceId: 9001, targetId: 9000 }]);
  });
});

describe("findInternalAreaDuplicates", () => {
  it("only compares siblings under the same parent, never across parents", () => {
    const areasByParent = new Map<number | null, BetabookAreaCandidate[]>([
      [18, [area(1, "Millennium"), area(2, "Millenium")]],
      [19, [{ ...area(3, "Millennium"), parentId: 19 }]],
    ]);
    expect(findInternalAreaDuplicates(areasByParent)).toEqual([{ sourceId: 2, targetId: 1 }]);
  });
});
