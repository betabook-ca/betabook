import { describe, expect, it } from "vitest";

import { mapGradeToOrdinal } from "./grades.ts";

describe("mapGradeToOrdinal", () => {
  it("maps a native boulder grade", () => {
    // BOULDER_HUECO starts at "VB" (index 0), so "V4" is index 5.
    expect(mapGradeToOrdinal("boulder", "V4")).toEqual({ grade: 5, scale: "native" });
  });

  it("maps a native rope grade", () => {
    expect(mapGradeToOrdinal("sport", "5.10a")).toEqual({ grade: 10, scale: "native" });
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(mapGradeToOrdinal("boulder", "  v4  ")).toEqual({ grade: 5, scale: "native" });
  });

  it("falls back to the converted Font scale for a boulder grade", () => {
    // HUECO_TO_FONT and BOULDER_HUECO are parallel arrays over the same
    // ordinal (see lib/grades.ts's top comment): "7A" is at index 7, which is
    // "V6" in BOULDER_HUECO.
    expect(mapGradeToOrdinal("boulder", "7A")).toEqual({ grade: 7, scale: "converted" });
  });

  it("falls back to the converted French scale for a rope grade", () => {
    // "6a" -> French ordinal 10, matching 5.10a in YDS_TO_FRENCH.
    expect(mapGradeToOrdinal("trad", "6a")).toEqual({ grade: 10, scale: "converted" });
  });

  it("returns null rather than guessing an unrecognized grade", () => {
    expect(mapGradeToOrdinal("boulder", "not a grade")).toEqual({ grade: null, scale: null });
  });

  it("returns null for an empty or missing grade", () => {
    expect(mapGradeToOrdinal("boulder", "")).toEqual({ grade: null, scale: null });
    expect(mapGradeToOrdinal("boulder", null)).toEqual({ grade: null, scale: null });
    expect(mapGradeToOrdinal("boulder", undefined)).toEqual({ grade: null, scale: null });
  });

  it("returns null rather than guessing when a converted-scale grade is ambiguous", () => {
    // YDS_TO_FRENCH has "7a+" at both 5.11c and 5.11d -- never pick one.
    expect(mapGradeToOrdinal("sport", "7a+")).toEqual({ grade: null, scale: null });
  });
});
