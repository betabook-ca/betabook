import { describe, expect, it } from "vitest";

import type { ClimbCandidate } from "@/db/queries";
import type { NormalizedImportRow } from "@/lib/sends-import";

import {
  areaLookupsNeeded,
  distinctClimbNames,
  duplicateClimbRows,
  foldClimbName,
  impliedGrades,
  matchRow,
  matchRows,
  mergeCandidates,
  resolveRows,
  summarizeResolved,
  type MatchOptions,
} from "./import-matching";

const US = { id: 9, name: "United States" };
const CANADA = { id: 8, name: "Canada" };
const CALIFORNIA = { id: 97, name: "California" };
const BC = { id: 80, name: "British Columbia" };
const BISHOP = { id: 4000, name: "Bishop" };
const SQUAMISH = { id: 4100, name: "Squamish" };

function candidate(overrides: Partial<ClimbCandidate> & { id: number }): ClimbCandidate {
  return {
    name: "The Wave",
    key: "the wave",
    type: "boulder",
    grade: 4, // V3
    areaId: 1,
    areaName: "Somewhere",
    sendCount: 0,
    ancestors: [],
    total: 1,
    ...overrides,
  };
}

/** Same name, three homes: a V3 at Bishop, a V6 at Squamish, a 5.11 route. */
const WAVES: ClimbCandidate[] = [
  candidate({
    id: 1,
    areaId: 4001,
    areaName: "Happy Boulders",
    grade: 4,
    ancestors: [US, CALIFORNIA, BISHOP],
    total: 3,
    sendCount: 10,
  }),
  candidate({
    id: 2,
    areaId: 4101,
    areaName: "Grand Wall Boulders",
    grade: 7,
    ancestors: [CANADA, BC, SQUAMISH],
    total: 3,
    sendCount: 5,
  }),
  candidate({
    id: 3,
    areaId: 5000,
    areaName: "Some Crag",
    type: "sport",
    grade: 14,
    ancestors: [US, { id: 98, name: "Nevada" }],
    total: 3,
  }),
];

function row(overrides: Partial<NormalizedImportRow> = {}): NormalizedImportRow {
  return {
    rowIndex: 0,
    climbName: "The Wave",
    areaName: null,
    areaHints: [],
    climbTypeHint: null,
    ascentStyle: "redpoint",
    dateSent: null,
    rating: null,
    comment: null,
    gradeText: null,
    blankGradeMeans: "posted-grade",
    postedGradeText: null,
    gradeFeel: "solid",
    raw: {},
    ...overrides,
  };
}

const NO_PREFERENCE: MatchOptions = { gradeScale: "native", preferredAreas: [] };

/** An index whose `total` agrees with what it holds, the server's untruncated
 * shape. Tests about truncation set `total` higher by hand. */
function indexOf(candidates: ClimbCandidate[]) {
  return mergeCandidates(
    new Map(),
    candidates.map((c) => ({ ...c, total: candidates.length })),
  );
}
const index = indexOf(WAVES);

describe("foldClimbName", () => {
  it("trims spaces and lowers ASCII only, like SQLite's LOWER(TRIM())", () => {
    expect(foldClimbName("  The Wave ")).toBe("the wave");
    expect(foldClimbName("Landjäger É")).toBe("landjäger É");
  });
});

describe("distinctClimbNames", () => {
  it("keeps one spelling per folded name, the first seen", () => {
    const names = distinctClimbNames([
      row({ climbName: "Zorro" }),
      row({ climbName: "zorro" }),
      row({ climbName: "Titanic" }),
    ]);
    expect(names).toEqual(["Zorro", "Titanic"]);
  });
});

describe("impliedGrades", () => {
  it("parses the text in both tables, so 'V4' is a boulder and '6a' is either", () => {
    expect(impliedGrades("v4", "native")).toEqual({ boulder: 5, rope: null });
    expect(impliedGrades("5.11a", "native")).toEqual({ boulder: null, rope: 14 });
    const both = impliedGrades("6a", "converted");
    expect(both.boulder).not.toBeNull();
    expect(both.rope).not.toBeNull();
    expect(impliedGrades(null, "native")).toEqual({ boulder: null, rope: null });
  });
});

describe("matchRow", () => {
  it("is none when no climb has the name", () => {
    expect(matchRow(row({ climbName: "Ghost" }), index, NO_PREFERENCE)).toEqual({ kind: "none" });
  });

  it("is exact when one climb has the name", () => {
    const single = indexOf([candidate({ id: 7, name: "Zorro", key: "zorro" })]);
    const match = matchRow(row({ climbName: "Zorro" }), single, NO_PREFERENCE);
    expect(match).toMatchObject({ kind: "exact", notes: [] });
  });

  it("notes an exact match that isn't under any preferred area, without demoting it", () => {
    const single = indexOf([WAVES[1]]);
    const match = matchRow(row(), single, { gradeScale: "native", preferredAreas: [BISHOP] });
    expect(match).toMatchObject({ kind: "exact", notes: ["Not in one of your areas"] });
  });

  it("is ambiguous when several share the name and nothing separates them", () => {
    const match = matchRow(row(), index, NO_PREFERENCE);
    expect(match).toMatchObject({
      kind: "ambiguous",
      total: 3,
      truncated: false,
      conflict: null,
      narrowedBy: null,
    });
    if (match.kind === "ambiguous") {
      expect(match.candidates.map((c) => c.id)).toEqual([1, 2, 3]);
    }
  });

  it("drops the other discipline when the grade text implies one", () => {
    // A boulder grade shared by two boulders: the route is out, the two
    // boulders remain, and the grade then settles it.
    const match = matchRow(row({ gradeText: "V6" }), index, NO_PREFERENCE);
    expect(match).toMatchObject({ kind: "inferred", reason: "the only V6" });
    if (match.kind === "inferred") {
      expect(match.climb.id).toBe(2);
      expect(match.alternatives.map((c) => c.id)).toEqual([1]);
    }
  });

  it("matches by the posted boulder grade while retaining the climber's grade", () => {
    const imported = row({ postedGradeText: "V6", gradeText: "V3" });
    const original = structuredClone(imported);
    expect(matchRow(imported, index, NO_PREFERENCE)).toMatchObject({
      kind: "inferred",
      climb: { id: 2 },
      reason: "the only V6",
    });
    expect(imported).toEqual(original);
    expect(imported.gradeText).toBe("V3");
  });

  it.each(["sport", "trad"] as const)(
    "matches %s routes using the posted grade before the climber's suggestion",
    (type) => {
      const candidates = indexOf([
        candidate({ id: 41, type, grade: 10 }), // 5.10a
        candidate({ id: 42, type, grade: 18 }), // 5.12a
      ]);
      expect(
        matchRow(
          row({ climbTypeHint: type, postedGradeText: "5.12a", gradeText: "5.10a" }),
          candidates,
          NO_PREFERENCE,
        ),
      ).toMatchObject({
        kind: "inferred",
        climb: { id: 42 },
        reason: "the only 5.12a",
      });
    },
  );

  it("uses the climber's grade when the posted grade is missing", () => {
    expect(
      matchRow(row({ postedGradeText: null, gradeText: "V3" }), index, NO_PREFERENCE),
    ).toMatchObject({
      kind: "inferred",
      climb: { id: 1 },
      reason: "the only V3",
    });
  });

  it("uses the posted grade when the climber gave none", () => {
    // A Mountain Project row: "Your Rating" blank, the route's "Rating" V6.
    const match = matchRow(row({ gradeText: null, postedGradeText: "V6" }), index, NO_PREFERENCE);
    expect(match).toMatchObject({ kind: "inferred", reason: "the only V6" });
    if (match.kind === "inferred") expect(match.climb.id).toBe(2);
  });

  it("spells out the conflict when the grade rules every same-named climb out", () => {
    const boulders = indexOf([WAVES[0], WAVES[1]]);
    const match = matchRow(row({ gradeText: "5.10a" }), boulders, NO_PREFERENCE);
    expect(match).toMatchObject({
      kind: "ambiguous",
      conflict: 'None of the 2 climbs with this name is a route, but "5.10a" is a route grade',
    });

    // Singular wording when the name has one climb.
    const single = matchRow(row({ gradeText: "5.10a" }), indexOf([WAVES[0]]), NO_PREFERENCE);
    expect(single).toMatchObject({
      kind: "ambiguous",
      total: 1,
      conflict: 'The one climb with this name isn\'t a route, but "5.10a" is a route grade',
    });
  });

  it("honors a mapped climb type over everything else", () => {
    const match = matchRow(row({ climbTypeHint: "sport" }), index, NO_PREFERENCE);
    expect(match).toMatchObject({ kind: "exact" });
    if (match.kind === "exact") expect(match.climb.id).toBe(3);

    const none = matchRow(row({ climbTypeHint: "trad" }), index, NO_PREFERENCE);
    expect(none).toMatchObject({
      kind: "ambiguous",
      conflict: "None of the 3 climbs with this name is a trad climb",
    });
  });

  it("requires the Area column to name the climb's area or an ancestor", () => {
    const match = matchRow(row({ areaName: "bishop" }), index, NO_PREFERENCE);
    expect(match).toMatchObject({ kind: "exact" });
    if (match.kind === "exact") expect(match.climb.id).toBe(1);

    const elsewhere = matchRow(row({ areaName: "Yosemite" }), index, NO_PREFERENCE);
    expect(elsewhere).toMatchObject({
      kind: "ambiguous",
      conflict: 'None of the 3 climbs with this name is in "Yosemite"',
    });
    if (elsewhere.kind === "ambiguous") expect(elsewhere.pool.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("breaks a tie toward a preferred area, and says so", () => {
    const boulders = indexOf([WAVES[0], WAVES[1]]);
    const match = matchRow(row(), boulders, { gradeScale: "native", preferredAreas: [SQUAMISH] });
    expect(match).toMatchObject({ kind: "inferred", reason: "in Squamish" });
    if (match.kind === "inferred") expect(match.climb.id).toBe(2);
  });

  it("names the preferred area of the climb it ends on, not of the first survivor", () => {
    // Two preferred areas each hold a same-named boulder; the grade decides.
    // The reason must say "in Squamish" (the winner), not "in Bishop" (the
    // first candidate the area step kept).
    const boulders = indexOf([WAVES[0], WAVES[1]]);
    const match = matchRow(row({ gradeText: "V6" }), boulders, {
      gradeScale: "native",
      preferredAreas: [BISHOP, SQUAMISH],
    });
    expect(match).toMatchObject({ kind: "inferred", reason: "the only V6" });
    if (match.kind === "inferred") expect(match.climb.id).toBe(2);

    // With a third, unpreferred twin the area step actually narrows, and its
    // reason is about the V6 the grade step then picks.
    const withThird = indexOf([
      WAVES[0],
      WAVES[1],
      candidate({ id: 5, grade: 7, areaName: "Elsewhere", ancestors: [US] }),
    ]);
    const narrowed = matchRow(row({ gradeText: "V6" }), withThird, {
      gradeScale: "native",
      preferredAreas: [BISHOP, SQUAMISH],
    });
    expect(narrowed).toMatchObject({ kind: "inferred", reason: "in Squamish; the only V6" });
  });

  it("uses hint columns in order, ignoring a hint that matches nothing", () => {
    const boulders = indexOf([WAVES[0], WAVES[1]]);
    // A KAYA row: boulder name first (matches no area here), country second.
    const match = matchRow(row({ areaHints: ["Some Boulder", "Canada"] }), boulders, NO_PREFERENCE);
    expect(match).toMatchObject({ kind: "inferred", reason: 'matches "Canada"' });
    if (match.kind === "inferred") expect(match.climb.id).toBe(2);
  });

  it("leaves a tie ambiguous when a hint narrows but doesn't settle it", () => {
    const usBoulders = indexOf([
      WAVES[0],
      candidate({
        id: 4,
        grade: 4,
        areaName: "Kraft Boulders",
        ancestors: [US, { id: 98, name: "Nevada" }],
      }),
      WAVES[1],
    ]);
    const match = matchRow(row({ areaHints: ["United States"] }), usBoulders, NO_PREFERENCE);
    expect(match).toMatchObject({
      kind: "ambiguous",
      conflict: null,
      narrowedBy: '"United States"',
    });
    if (match.kind === "ambiguous") {
      expect(match.candidates.map((c) => c.id)).toEqual([1, 4]);
      expect(match.pool.map((c) => c.id)).toEqual([1, 4, 2]);
    }
  });

  it("never lets a soft signal empty the set", () => {
    const boulders = indexOf([WAVES[0], WAVES[1]]);
    // V9 matches neither; the tie stands rather than becoming "none".
    const match = matchRow(row({ gradeText: "V9" }), boulders, NO_PREFERENCE);
    expect(match).toMatchObject({ kind: "ambiguous", conflict: null, narrowedBy: null });
  });

  it("won't infer from a truncated list, since the right climb may have been cut", () => {
    // The server says 30 share the name but sent two; a grade that singles
    // one of the two out proves nothing about the other 28.
    const truncated = mergeCandidates(
      new Map(),
      [WAVES[0], WAVES[1]].map((c) => ({ ...c, total: 30 })),
    );
    const match = matchRow(row({ gradeText: "V6" }), truncated, NO_PREFERENCE);
    expect(match).toMatchObject({
      kind: "ambiguous",
      truncated: true,
      narrowedBy: 'the grade "V6"',
    });
    if (match.kind === "ambiguous") expect(match.candidates.map((c) => c.id)).toEqual([2]);

    // Even a lone survivor of the hard filters isn't trusted.
    const lone = mergeCandidates(
      new Map(),
      [WAVES[2]].map((c) => ({ ...c, total: 30 })),
    );
    expect(matchRow(row({ climbTypeHint: "sport" }), lone, NO_PREFERENCE)).toMatchObject({
      kind: "ambiguous",
      truncated: true,
    });

    // Unless the Area column picked it: that lookup saw every climb of the
    // name in the area.
    const byArea = matchRow(
      row({ areaName: "Squamish", gradeText: "V6" }),
      truncated,
      NO_PREFERENCE,
    );
    expect(byArea).toMatchObject({ kind: "exact" });
    if (byArea.kind === "exact") expect(byArea.climb.id).toBe(2);
  });
});

describe("areaLookupsNeeded", () => {
  it("lists one (name, area) pair per truncated name that a row places in an area", () => {
    const truncated = mergeCandidates(
      new Map(),
      [WAVES[0]].map((c) => ({ ...c, total: 40 })),
    );
    const rows = [
      row({ rowIndex: 0, areaName: "Little Crag" }),
      row({ rowIndex: 1, areaName: "little crag" }), // same pair, folded
      row({ rowIndex: 2, areaName: "Other Crag" }),
      row({ rowIndex: 3 }), // no area: nothing to scope a lookup by
      row({ rowIndex: 4, climbName: "Zorro", areaName: "Little Crag" }), // no candidates at all
    ];
    expect(areaLookupsNeeded(rows, truncated)).toEqual([
      { name: "The Wave", areaName: "Little Crag" },
      { name: "The Wave", areaName: "Other Crag" },
    ]);
    expect(areaLookupsNeeded(rows, index)).toEqual([]);
  });

  it("does not collide (name, area) pairs when space-separated names could overlap", () => {
    const truncated = mergeCandidates(new Map(), [
      candidate({ id: 1, name: "The Wave", key: "the wave", total: 40 }),
      candidate({ id: 2, name: "The", key: "the", total: 40 }),
    ]);
    const rows = [
      row({ rowIndex: 0, climbName: "The Wave", areaName: "Left" }),
      row({ rowIndex: 1, climbName: "The", areaName: "Wave Left" }),
    ];
    expect(areaLookupsNeeded(rows, truncated)).toEqual([
      { name: "The Wave", areaName: "Left" },
      { name: "The", areaName: "Wave Left" },
    ]);
  });
});

describe("mergeCandidates", () => {
  it("groups the first lookup by key, keeping the server's order within each group", () => {
    const other = candidate({ id: 9, name: "Zorro", key: "zorro" });
    const merged = mergeCandidates(new Map(), [WAVES[0], other, WAVES[1], WAVES[2]]);
    expect([...merged.keys()]).toEqual(["the wave", "zorro"]);
    expect(merged.get("the wave")?.map((climb) => climb.id)).toEqual([1, 2, 3]);
    expect(merged.get("zorro")).toEqual([other]);
    expect(merged.get("nothing")).toBeUndefined();
  });

  it("appends climbs a later lookup found and ignores ones already present", () => {
    const extra = candidate({ id: 9, areaName: "Little Crag", ancestors: [US], total: 40 });
    const merged = mergeCandidates(index, [extra, WAVES[0]]);
    expect(merged.get("the wave")?.map((c) => c.id)).toEqual([1, 2, 3, 9]);
    expect(index.get("the wave")).toHaveLength(3); // the input is untouched
  });
});

describe("resolveRows", () => {
  const rows = [
    row({ rowIndex: 0, gradeText: "V6" }), // inferred -> review
    row({ rowIndex: 1 }), // ambiguous -> attention
    row({ rowIndex: 2, climbName: "Ghost" }), // none -> attention
    row({ rowIndex: 3, climbName: "Ghost" }), // skipped by hand
    row({ rowIndex: 4 }), // picked by hand
  ];

  it("layers manual choices over the automatic match and sums up the states", () => {
    const manual = new Map([
      [3, { kind: "skip" as const }],
      [4, { kind: "pick" as const, climb: WAVES[0] }],
    ]);
    const resolved = resolveRows(rows, matchRows(rows, index, NO_PREFERENCE), manual);

    expect(resolved.map((r) => r.state)).toEqual([
      "review",
      "attention",
      "attention",
      "skipped",
      "picked",
    ]);
    expect(resolved.map((r) => r.climb?.id ?? null)).toEqual([2, null, null, null, 1]);
    expect(summarizeResolved(resolved)).toEqual({
      matched: 0,
      review: 1,
      attention: 2,
      picked: 1,
      skipped: 1,
      ready: 2,
    });
  });

  it("flags a later row that lands on a climb an earlier row already has", () => {
    const manual = new Map([
      [1, { kind: "pick" as const, climb: WAVES[1] }], // same climb the V6 row inferred
    ]);
    const two = rows.slice(0, 2);
    const resolved = resolveRows(two, matchRows(two, index, NO_PREFERENCE), manual);
    const duplicates = duplicateClimbRows(resolved);
    expect([...duplicates.keys()]).toEqual([1]);
    expect(duplicates.get(1)?.rowIndex).toBe(0);
    expect(summarizeResolved(resolved).ready).toBe(1);
  });
});

it("matches generic outdoor routes to sport or trad while excluding same-name boulders", () => {
  const candidates = indexOf([
    candidate({ id: 11 }),
    candidate({ id: 12, type: "sport" }),
    candidate({ id: 13, type: "trad" }),
  ]);
  const result = matchRow(row({ climbTypeHint: "route" }), candidates, NO_PREFERENCE);
  expect(result.kind).toBe("ambiguous");
  if (result.kind !== "ambiguous") throw new Error("Expected an ambiguous route match");
  expect(result.candidates.map((c) => c.id).sort((a, b) => a - b)).toEqual([12, 13]);
  for (const type of ["sport", "trad"] as const) {
    const single = indexOf([candidate({ id: 11 }), candidate({ id: 12, type })]);
    expect(matchRow(row({ climbTypeHint: "route" }), single, NO_PREFERENCE)).toMatchObject({
      kind: "exact",
      climb: { id: 12, type },
    });
  }
});
