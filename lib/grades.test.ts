import { describe, expect, it } from "vitest";

import {
  BOULDER_HUECO,
  DEFAULT_GRADE_PREFERENCES,
  HUECO_TO_FONT,
  ROPE_YDS,
  YDS_TO_FRENCH,
  describeGradeTrend,
  formatActivityGrade,
  formatGrade,
  gradeArray,
  gradeLabelGroups,
  gradeOptionValue,
  gradeOptions,
  nativeGradeArray,
  parseGrade,
  type GradePreferences,
} from "./grades";

const FONT: GradePreferences = { boulder: "font", rope: "yds" };
const FRENCH: GradePreferences = { boulder: "hueco", rope: "french" };
const EURO: GradePreferences = { boulder: "font", rope: "french" };

describe("formatGrade", () => {
  it("returns the '—' fallback when grade is null or undefined", () => {
    expect(formatGrade("boulder", null)).toBe("—");
    expect(formatGrade("boulder", undefined)).toBe("—");
    expect(formatGrade("sport", null)).toBe("—");
  });

  it("formats a boulder grade in its native Hueco scale by default", () => {
    expect(formatGrade("boulder", 5)).toBe("V4");
    expect(formatGrade("boulder", 0)).toBe("VB");
  });

  it("formats sport and trad grades in the shared native YDS scale by default", () => {
    expect(formatGrade("sport", 10)).toBe("5.10a");
    expect(formatGrade("trad", 6)).toBe("5.6");
  });

  it("formats a boulder grade in Font when the climber prefers it", () => {
    expect(formatGrade("boulder", 5, FONT)).toBe("6B");
    expect(formatGrade("boulder", 5, FONT)).not.toBe(BOULDER_HUECO[5]);
  });

  it("formats a rope grade in French when the climber prefers it", () => {
    expect(formatGrade("sport", 11, FRENCH)).toBe("6a");
    expect(formatGrade("trad", 11, FRENCH)).toBe("6a");
  });

  it("applies each preference only to its own discipline family", () => {
    expect(formatGrade("boulder", 5, FRENCH)).toBe("V4");
    expect(formatGrade("sport", 11, FONT)).toBe("5.10b");
    expect(formatGrade("boulder", 5, EURO)).toBe("6B");
    expect(formatGrade("sport", 11, EURO)).toBe("6a");
  });

  it("returns the '—' fallback for an out-of-range grade", () => {
    expect(formatGrade("boulder", 999)).toBe("—");
    expect(formatGrade("boulder", -1)).toBe("—");
    expect(formatGrade("sport", 999, FRENCH)).toBe("—");
  });

  it("treats sport and trad as the same discipline for grade formatting", () => {
    expect(formatGrade("sport", 12)).toBe(formatGrade("trad", 12));
  });
});

describe("nativeGradeArray and gradeArray", () => {
  it("returns the Hueco array for boulder", () => {
    expect(nativeGradeArray("boulder")).toBe(BOULDER_HUECO);
  });

  it("returns the shared YDS array for both sport and trad", () => {
    expect(nativeGradeArray("sport")).toBe(ROPE_YDS);
    expect(nativeGradeArray("trad")).toBe(ROPE_YDS);
  });

  it("gradeArray follows the preference and defaults to native", () => {
    expect(gradeArray("boulder")).toBe(BOULDER_HUECO);
    expect(gradeArray("sport")).toBe(ROPE_YDS);
    expect(gradeArray("boulder", EURO)).toBe(HUECO_TO_FONT);
    expect(gradeArray("trad", EURO)).toBe(YDS_TO_FRENCH);
    expect(DEFAULT_GRADE_PREFERENCES).toEqual({ boulder: "hueco", rope: "yds" });
  });
});

describe("grade scale tables", () => {
  it("keeps HUECO_TO_FONT the same length as BOULDER_HUECO", () => {
    expect(HUECO_TO_FONT.length).toBe(BOULDER_HUECO.length);
  });

  it("keeps YDS_TO_FRENCH the same length as ROPE_YDS", () => {
    expect(YDS_TO_FRENCH.length).toBe(ROPE_YDS.length);
  });

  it("follows the Guide Dolomiti chart for YDS → French", () => {
    const at = (yds: string) => YDS_TO_FRENCH[ROPE_YDS.indexOf(yds as (typeof ROPE_YDS)[number])];
    expect(at("5.5")).toBe("4a");
    expect(at("5.9")).toBe("5b");
    expect(at("5.10a")).toBe("5c");
    expect(at("5.10b")).toBe("6a");
    expect(at("5.11c")).toBe("6c+");
    expect(at("5.11d")).toBe("7a");
    expect(at("5.12a")).toBe("7a+");
    expect(at("5.13b")).toBe("8a");
    expect(at("5.14d")).toBe("9a");
    expect(at("5.15d")).toBe("9c");
  });

  it("follows the Guide Dolomiti chart for Hueco → Font", () => {
    const at = (v: string) =>
      HUECO_TO_FONT[BOULDER_HUECO.indexOf(v as (typeof BOULDER_HUECO)[number])];
    expect(at("V0")).toBe("4");
    expect(at("V3")).toBe("6A");
    expect(at("V6")).toBe("7A");
    expect(at("V11")).toBe("8A");
    expect(at("V17")).toBe("9A");
  });

  it("repeats a label only at the bottom of the French scale", () => {
    const repeated = (type: "boulder" | "sport", prefs: GradePreferences) =>
      gradeLabelGroups(type, prefs).filter((group) => group.max > group.min);
    expect(repeated("sport", FRENCH)).toEqual([
      { label: "2", min: 1, max: 2 },
      { label: "3", min: 3, max: 4 },
    ]);
    expect(repeated("boulder", FONT)).toEqual([]);
    expect(repeated("boulder", DEFAULT_GRADE_PREFERENCES)).toEqual([]);
    expect(repeated("sport", DEFAULT_GRADE_PREFERENCES)).toEqual([]);
  });
});

describe("gradeOptions and gradeOptionValue", () => {
  it("offers every native grade with its own ordinal as the value", () => {
    expect(gradeOptions("boulder")).toEqual(
      BOULDER_HUECO.map((label, i) => ({ value: String(i), label })),
    );
    expect(gradeOptions("trad")).toHaveLength(ROPE_YDS.length);
  });

  it("offers one option per French label and submits the larger ordinal", () => {
    const options = gradeOptions("sport", FRENCH);
    expect(options).toHaveLength(ROPE_YDS.length - 2);
    expect(options.slice(0, 4)).toEqual([
      { value: "0", label: "1" },
      { value: "2", label: "2" },
      { value: "4", label: "3" },
      { value: "5", label: "4a" },
    ]);
    expect(options.at(-1)).toEqual({ value: "33", label: "9c" });
    expect(options.filter((option) => option.label === "7a")).toEqual([
      { value: "17", label: "7a" },
    ]);
  });

  it("offers Font labels one-to-one with Hueco ordinals", () => {
    expect(gradeOptions("boulder", FONT)).toEqual(
      HUECO_TO_FONT.map((label, i) => ({ value: String(i), label })),
    );
  });

  it("shows a stored ordinal as its label group's option without changing it", () => {
    expect(gradeOptionValue("sport", 1, FRENCH)).toBe("2");
    expect(gradeOptionValue("sport", 2, FRENCH)).toBe("2");
    expect(gradeOptionValue("sport", 3, FRENCH)).toBe("4");
    expect(gradeOptionValue("sport", 17, FRENCH)).toBe("17");
    expect(gradeOptionValue("sport", 1)).toBe("1");
    expect(gradeOptionValue("boulder", 5, FONT)).toBe("5");
  });

  it("passes an out-of-range ordinal through so a form can still show nothing selected", () => {
    expect(gradeOptionValue("sport", 99, FRENCH)).toBe("99");
  });
});

describe("parseGrade", () => {
  it("parses a native-scale boulder grade", () => {
    expect(parseGrade("boulder", "V4")).toBe(5);
    expect(parseGrade("boulder", "VB")).toBe(0);
  });

  it("parses a native-scale rope grade for sport and trad", () => {
    expect(parseGrade("sport", "5.10a")).toBe(10);
    expect(parseGrade("trad", "5.6")).toBe(6);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(parseGrade("boulder", "  v4  ")).toBe(5);
    expect(parseGrade("boulder", "6b", "converted")).toBe(5);
  });

  it("parses a converted-scale grade when requested", () => {
    expect(parseGrade("boulder", "6B", "converted")).toBe(5);
    expect(parseGrade("sport", "6a", "converted")).toBe(11);
    expect(parseGrade("sport", "7a", "converted")).toBe(17);
    expect(parseGrade("sport", "7a+", "converted")).toBe(18);
  });

  it("resolves a repeated French label to its larger ordinal", () => {
    expect(YDS_TO_FRENCH[1]).toBe("2");
    expect(YDS_TO_FRENCH[2]).toBe("2");
    expect(parseGrade("sport", "2", "converted")).toBe(2);
    expect(parseGrade("sport", "3", "converted")).toBe(4);
  });

  it("resolves Font steps without an ordinal upward to the next V grade", () => {
    expect(parseGrade("boulder", "6A+", "converted")).toBe(5);
    expect(parseGrade("boulder", "6b+", "converted")).toBe(6);
    expect(parseGrade("boulder", "6C+", "converted")).toBe(7);
    expect(parseGrade("boulder", "7B+", "converted")).toBe(10);
    expect(parseGrade("boulder", "4-", "converted")).toBe(1);
    expect(parseGrade("boulder", "4+", "converted")).toBe(2);
  });

  it("resolves the Hueco half-steps V0- and V0+ the same way", () => {
    expect(parseGrade("boulder", "V0-")).toBe(1);
    expect(parseGrade("boulder", "V0+")).toBe(2);
  });

  it("does not apply Font aliases to rope grades or native parsing", () => {
    expect(parseGrade("sport", "4-", "converted")).toBeNull();
    expect(parseGrade("boulder", "6A+")).toBeNull();
    expect(parseGrade("boulder", "V0-", "converted")).toBeNull();
  });

  it("returns null for text that doesn't match anything in the table", () => {
    expect(parseGrade("boulder", "V99")).toBeNull();
    expect(parseGrade("sport", "not a grade")).toBeNull();
  });

  it("returns null for blank text", () => {
    expect(parseGrade("boulder", "")).toBeNull();
    expect(parseGrade("boulder", "   ")).toBeNull();
  });
});

describe("describeGradeTrend", () => {
  it("shows only the posted grade when there's no suggested-grade data", () => {
    expect(describeGradeTrend("boulder", 5, null)).toEqual({
      postedLabel: "V4",
      suggestedLabel: null,
      arrow: null,
    });
    expect(describeGradeTrend("boulder", null, 5)).toEqual({
      postedLabel: "—",
      suggestedLabel: null,
      arrow: null,
    });
  });

  it("shows no arrow or suggested label when the average matches the posted grade exactly", () => {
    expect(describeGradeTrend("boulder", 5, 5)).toEqual({
      postedLabel: "V4",
      suggestedLabel: null,
      arrow: null,
    });
  });

  it("shows a bare arrow (no suggested label) for a lean under the rounding threshold", () => {
    expect(describeGradeTrend("boulder", 5, 5.3)).toEqual({
      postedLabel: "V4",
      suggestedLabel: null,
      arrow: "up",
    });
    expect(describeGradeTrend("boulder", 5, 4.7)).toEqual({
      postedLabel: "V4",
      suggestedLabel: null,
      arrow: "down",
    });
  });

  it("shows a suggested label once the average rounds to a different grade step", () => {
    expect(describeGradeTrend("boulder", 5, 6)).toEqual({
      postedLabel: "V4",
      suggestedLabel: "V5",
      arrow: null,
    });
  });

  it("shows both a suggested label and an arrow when the average leans past the rounded step", () => {
    expect(describeGradeTrend("boulder", 5, 6.3)).toEqual({
      postedLabel: "V4",
      suggestedLabel: "V5",
      arrow: "up",
    });
  });

  it("labels the trend in the climber's chosen scale", () => {
    expect(describeGradeTrend("boulder", 5, 6, EURO)).toEqual({
      postedLabel: "6B",
      suggestedLabel: "6C",
      arrow: null,
    });
    expect(describeGradeTrend("sport", 11, 12, EURO)).toEqual({
      postedLabel: "6a",
      suggestedLabel: "6a+",
      arrow: null,
    });
  });

  it("keeps only the arrow when the chosen scale prints the step with the posted label", () => {
    // 5.1 and 5.2 are both French "2": "2 (2)" would say nothing.
    expect(describeGradeTrend("sport", 1, 2, FRENCH)).toEqual({
      postedLabel: "2",
      suggestedLabel: null,
      arrow: "up",
    });
    expect(describeGradeTrend("sport", 2, 1, FRENCH)).toEqual({
      postedLabel: "2",
      suggestedLabel: null,
      arrow: "down",
    });
    expect(describeGradeTrend("sport", 1, 2)).toEqual({
      postedLabel: "5.1",
      suggestedLabel: "5.2",
      arrow: null,
    });
  });
});

describe("formatActivityGrade", () => {
  it("prefers the climber's reported grade and follows the chosen scale", () => {
    expect(formatActivityGrade("sport", 10, true, 11)).toBe("5.10b");
    expect(formatActivityGrade("sport", 10, true, 11, FRENCH)).toBe("6a");
    expect(formatActivityGrade("boulder", 5, true, null, EURO)).toBe("6B");
  });

  it("shows nothing for incomplete activity or an unknown type", () => {
    expect(formatActivityGrade("sport", 10, false, 11, FRENCH)).toBeNull();
    expect(formatActivityGrade(null, 10, true, 11, FRENCH)).toBeNull();
  });
});
