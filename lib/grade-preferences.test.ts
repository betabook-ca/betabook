import { describe, expect, it } from "vitest";

import { ActionError } from "@/lib/action-result";
import { DEFAULT_GRADE_PREFERENCES } from "@/lib/grades";

import {
  BOULDER_GRADE_SCALES,
  INVALID_GRADE_SCALE_MESSAGE,
  ROPE_GRADE_SCALES,
  gradePreferencesFor,
  parseBoulderGradeScale,
  parseRopeGradeScale,
} from "./grade-preferences";

describe("grade scale parsers", () => {
  it("accept exactly the two systems per discipline family", () => {
    expect(BOULDER_GRADE_SCALES.map((s) => s.value)).toEqual(["hueco", "font"]);
    expect(ROPE_GRADE_SCALES.map((s) => s.value)).toEqual(["yds", "french"]);
    expect(parseBoulderGradeScale("hueco")).toBe("hueco");
    expect(parseBoulderGradeScale("font")).toBe("font");
    expect(parseRopeGradeScale("yds")).toBe("yds");
    expect(parseRopeGradeScale("french")).toBe("french");
  });

  it("reject a system from the other family, casing variants and junk with the action message", () => {
    for (const value of ["french", "Font", "FONT", "", null, undefined, 1, {}]) {
      expect(() => parseBoulderGradeScale(value)).toThrow(
        new ActionError(INVALID_GRADE_SCALE_MESSAGE),
      );
    }
    for (const value of ["font", "French", "yosemite", "", null]) {
      expect(() => parseRopeGradeScale(value)).toThrow(
        new ActionError(INVALID_GRADE_SCALE_MESSAGE),
      );
    }
  });
});

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
