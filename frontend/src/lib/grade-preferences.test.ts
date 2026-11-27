import { describe, expect, it } from "vitest";

import { DEFAULT_GRADE_PREFERENCES } from "@/lib/grades";

import { gradePreferencesFor } from "./grade-preferences";

describe("gradePreferencesFor", () => {
  it("reads both stored columns", () => {
    expect(gradePreferencesFor({ boulderGradeScale: "font", ropeGradeScale: "french" })).toEqual({
      boulder: "font",
      rope: "french",
    });
    expect(gradePreferencesFor({ boulderGradeScale: "font", ropeGradeScale: "yds" })).toEqual({
      boulder: "font",
      rope: "yds",
    });
  });

  it("falls back to the native scales for a signed-out reader or missing fields", () => {
    expect(gradePreferencesFor(null)).toBe(DEFAULT_GRADE_PREFERENCES);
    expect(gradePreferencesFor(undefined)).toBe(DEFAULT_GRADE_PREFERENCES);
    expect(gradePreferencesFor({})).toBe(DEFAULT_GRADE_PREFERENCES);
    expect(gradePreferencesFor({ boulderGradeScale: null, ropeGradeScale: null })).toBe(
      DEFAULT_GRADE_PREFERENCES,
    );
  });

  it("keeps the valid half when the other column holds an unexpected value", () => {
    expect(gradePreferencesFor({ boulderGradeScale: "font", ropeGradeScale: "metric" })).toEqual({
      boulder: "font",
      rope: "yds",
    });
  });
});
