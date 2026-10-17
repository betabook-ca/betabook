import { describe, expect, it } from "vitest";

import type { GradeHistogramRow } from "@/db/queries";

import { buildGradeHistogram, buildLoggedGradeRows } from "./grade-histogram";

describe("buildGradeHistogram", () => {
  it("returns an empty histogram for no rows", () => {
    const h = buildGradeHistogram([]);
    expect(h.totalClimbs).toBe(0);
    expect(h.groups).toEqual([]);
    expect(h.boulderSpan).toBeNull();
    expect(h.ropeSpan).toBeNull();
    expect(h.disciplines).toEqual([]);
  });

  it("gives boulders one bucket per V grade, contiguous across gaps", () => {
    const rows: GradeHistogramRow[] = [
      { type: "boulder", grade: 1, count: 2 }, // V0
      { type: "boulder", grade: 4, count: 1 }, // V3
    ];
    const h = buildGradeHistogram(rows);
    expect(h.groups).toEqual([
      {
        type: "boulder",
        buckets: [
          { label: "V0", count: 2, range: [1, 1] },
          { label: "V1", count: 0, range: [2, 2] },
          { label: "V2", count: 0, range: [3, 3] },
          { label: "V3", count: 1, range: [4, 4] },
        ],
      },
    ]);
    expect(h.boulderSpan).toEqual(["V0", "V3"]);
  });

  it("collapses rope letter grades per discipline, one chart each", () => {
    const rows: GradeHistogramRow[] = [
      { type: "sport", grade: 10, count: 1 }, // 5.10a
      { type: "sport", grade: 13, count: 2 }, // 5.10d
      { type: "trad", grade: 11, count: 3 }, // 5.10b
      { type: "trad", grade: 14, count: 1 }, // 5.11a
    ];
    const h = buildGradeHistogram(rows);
    expect(h.groups).toEqual([
      { type: "sport", buckets: [{ label: "5.10", count: 3, range: [10, 13] }] },
      {
        type: "trad",
        buckets: [
          { label: "5.10", count: 3, range: [10, 13] },
          { label: "5.11", count: 1, range: [14, 17] },
        ],
      },
    ]);
    expect(h.ropeSpan).toEqual(["5.10a", "5.11a"]);
  });

  it("labels buckets in the reader's scales, collapsing French plus grades to the letter", () => {
    const rows: GradeHistogramRow[] = [
      { type: "boulder", grade: 5, count: 1 }, // V4 → 6B
      { type: "sport", grade: 11, count: 1 }, // 5.10b → 6a
      { type: "sport", grade: 12, count: 2 }, // 5.10c → 6a+
      { type: "sport", grade: 14, count: 1 }, // 5.11a → 6b+
    ];
    const h = buildGradeHistogram(rows, { boulder: "font", rope: "french" });
    expect(h.groups).toEqual([
      { type: "boulder", buckets: [{ label: "6B", count: 1, range: [5, 5] }] },
      {
        type: "sport",
        buckets: [
          { label: "6a", count: 3, range: [11, 12] },
          { label: "6b", count: 1, range: [13, 14] },
        ],
      },
    ]);
    expect(h.boulderSpan).toEqual(["6B", "6B"]);
    expect(h.ropeSpan).toEqual(["6a", "6b+"]);
  });

  it("keeps a repeated French label as one bucket spanning both ordinals", () => {
    const rows: GradeHistogramRow[] = [
      { type: "trad", grade: 1, count: 2 }, // 5.1 → 2
      { type: "trad", grade: 2, count: 1 }, // 5.2 → 2
    ];
    const h = buildGradeHistogram(rows, { boulder: "hueco", rope: "french" });
    expect(h.groups).toEqual([
      { type: "trad", buckets: [{ label: "2", count: 3, range: [1, 2] }] },
    ]);
  });

  it("footnotes ungraded climbs instead of giving them a bar", () => {
    const rows: GradeHistogramRow[] = [
      { type: "sport", grade: null, count: 4 },
      { type: "sport", grade: 8, count: 1 },
    ];
    const h = buildGradeHistogram(rows);
    expect(h.ungradedCount).toBe(4);
    expect(h.totalClimbs).toBe(5);
    expect(h.groups).toEqual([
      { type: "sport", buckets: [{ label: "5.8", count: 1, range: [8, 8] }] },
    ]);
  });

  it("lists disciplines present in boulder → sport → trad order", () => {
    const rows: GradeHistogramRow[] = [
      { type: "trad", grade: 8, count: 1 },
      { type: "boulder", grade: 3, count: 1 },
    ];
    expect(buildGradeHistogram(rows).disciplines).toEqual(["boulder", "trad"]);
  });

  it("ignores out-of-range grade ordinals rather than crashing the header", () => {
    const rows: GradeHistogramRow[] = [
      { type: "boulder", grade: 99, count: 1 },
      { type: "boulder", grade: 2, count: 1 },
    ];
    const h = buildGradeHistogram(rows);
    expect(h.groups).toEqual([
      { type: "boulder", buckets: [{ label: "V1", count: 1, range: [2, 2] }] },
    ]);
  });
});

describe("buildLoggedGradeRows", () => {
  it("returns no rows when nobody suggested a grade", () => {
    expect(buildLoggedGradeRows("sport", [], 10)).toEqual([]);
  });

  it("merges feels for the same grade into one row's feel counts", () => {
    const rows = buildLoggedGradeRows(
      "sport",
      [
        { grade: 18, feel: "high", count: 1 }, // 5.12a hard
        { grade: 18, feel: "low", count: 2 }, // 5.12a soft
        { grade: 18, feel: "solid", count: 3 },
      ],
      18,
    );
    expect(rows).toEqual([
      {
        label: "5.12a",
        total: 6,
        isPosted: true,
        feelCounts: { low: 2, solid: 3, high: 1 },
      },
    ]);
  });

  it("orders rows by grade and appends a zero-vote row for a posted grade nobody suggested", () => {
    const rows = buildLoggedGradeRows(
      "sport",
      [
        { grade: 12, feel: "solid", count: 1 }, // 5.10c
        { grade: 11, feel: "solid", count: 2 }, // 5.10b
      ],
      10, // posted 5.10a, below every suggestion
    );
    expect(rows).toEqual([
      { label: "5.10b", total: 2, isPosted: false, feelCounts: { low: 0, solid: 2, high: 0 } },
      { label: "5.10c", total: 1, isPosted: false, feelCounts: { low: 0, solid: 1, high: 0 } },
      { label: "5.10a", total: 0, isPosted: true, feelCounts: { low: 0, solid: 0, high: 0 } },
    ]);
  });

  it("marks the posted grade even when it also received votes", () => {
    const rows = buildLoggedGradeRows("boulder", [{ grade: 5, feel: "solid", count: 3 }], 5);
    expect(rows).toEqual([
      { label: "V4", total: 3, isPosted: true, feelCounts: { low: 0, solid: 3, high: 0 } },
    ]);
  });

  it("labels rows in the reader's scale and folds ordinals that share a label", () => {
    const french = { boulder: "hueco", rope: "french" } as const;
    expect(
      buildLoggedGradeRows("sport", [{ grade: 18, feel: "solid", count: 2 }], 17, french),
    ).toEqual([
      { label: "7a+", total: 2, isPosted: false, feelCounts: { low: 0, solid: 2, high: 0 } },
      { label: "7a", total: 0, isPosted: true, feelCounts: { low: 0, solid: 0, high: 0 } },
    ]);
    // 5.1 and 5.2 both print as French 2: one row, still marked as posted.
    expect(
      buildLoggedGradeRows(
        "sport",
        [
          { grade: 1, feel: "solid", count: 1 },
          { grade: 2, feel: "high", count: 1 },
        ],
        1,
        french,
      ),
    ).toEqual([
      { label: "2", total: 2, isPosted: true, feelCounts: { low: 0, solid: 1, high: 1 } },
    ]);
  });

  it("handles a null posted grade without adding a marker row", () => {
    const rows = buildLoggedGradeRows("trad", [{ grade: 8, feel: "low", count: 1 }], null);
    expect(rows).toEqual([
      { label: "5.8", total: 1, isPosted: false, feelCounts: { low: 1, solid: 0, high: 0 } },
    ]);
  });
});
