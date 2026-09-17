import { describe, expect, it } from "vitest";

import type { Climb } from "@/db/queries";

import { validateClimbEditInput, validateClimbMergeOverrides } from "./climbs";

const baseClimb: Climb = {
  id: 1,
  areaId: 1,
  name: "Existing Climb",
  type: "boulder",
  grade: 3,
  description: null,
  brokenOn: null,
  sendCount: 0,
  ratingSum: 0,
  ratingCount: 0,
  avgRating: null,
};

describe("validateClimbEditInput", () => {
  const raw = { name: "Renamed", type: "sport", grade: "8" };

  it("preserves an unknown grade during a same-discipline rename", () => {
    expect(
      validateClimbEditInput(
        { ...baseClimb, grade: null },
        {
          name: "Renamed",
          type: "boulder",
          grade: "",
        },
      ),
    ).toEqual({ name: "Renamed", type: "boulder", grade: null });
    expect(() =>
      validateClimbEditInput(baseClimb, { name: "Renamed", type: "boulder", grade: "" }),
    ).toThrow("Grade is required");
    expect(() =>
      validateClimbEditInput(
        { ...baseClimb, grade: null },
        { name: "Renamed", type: "sport", grade: "" },
      ),
    ).toThrow("Grade is required");
  });

  it("accepts a discipline change while the climb has no sends — description isn't part of it", () => {
    expect(validateClimbEditInput(baseClimb, raw)).toEqual({
      name: "Renamed",
      type: "sport",
      grade: 8,
    });
  });

  it("blocks a discipline change once sends exist", () => {
    expect(() => validateClimbEditInput({ ...baseClimb, sendCount: 2 }, raw)).toThrow(
      "Can't change discipline once a climb has logged sends",
    );
  });

  it("allows a same-discipline edit regardless of sends", () => {
    expect(
      validateClimbEditInput(
        { ...baseClimb, sendCount: 2 },
        { ...raw, type: "boulder", grade: "5" },
      ),
    ).toEqual({ name: "Renamed", type: "boulder", grade: 5 });
  });

  it("parses the grade against the requested discipline's scale", () => {
    // Grade 20 exists for ropes (5.11a) but is out of range for boulders.
    expect(() =>
      validateClimbEditInput(baseClimb, { ...raw, type: "boulder", grade: "20" }),
    ).toThrow("Invalid grade");
  });
});

describe("validateClimbMergeOverrides", () => {
  it("returns {} for an absent overrides object", () => {
    expect(validateClimbMergeOverrides(baseClimb, undefined)).toEqual({});
    expect(validateClimbMergeOverrides(baseClimb, null)).toEqual({});
  });

  it("keeps only whitelisted keys, validated", () => {
    expect(
      validateClimbMergeOverrides(baseClimb, {
        name: "  Merged  ",
        grade: 5,
        description: "  desc  ",
        areaId: 999,
        sendCount: 42,
        type: "sport",
      }),
    ).toEqual({ name: "Merged", grade: 5, description: "desc" });
  });

  it("rejects a non-object", () => {
    expect(() => validateClimbMergeOverrides(baseClimb, "nope")).toThrow("Invalid merge overrides");
    expect(() => validateClimbMergeOverrides(baseClimb, ["nope"])).toThrow(
      "Invalid merge overrides",
    );
  });

  it("rejects an out-of-scale or non-integer grade", () => {
    expect(() => validateClimbMergeOverrides(baseClimb, { grade: 999 })).toThrow("Invalid grade");
    expect(() => validateClimbMergeOverrides(baseClimb, { grade: 2.5 })).toThrow("Invalid grade");
    expect(() => validateClimbMergeOverrides(baseClimb, { grade: {} })).toThrow(
      "Grade is required",
    );
  });

  it("rejects an empty or non-string name", () => {
    expect(() => validateClimbMergeOverrides(baseClimb, { name: "   " })).toThrow(
      "Name is required",
    );
    expect(() => validateClimbMergeOverrides(baseClimb, { name: 42 })).toThrow("Name is required");
  });

  it("clears the description with null or whitespace", () => {
    expect(validateClimbMergeOverrides(baseClimb, { description: null })).toEqual({
      description: null,
    });
    expect(validateClimbMergeOverrides(baseClimb, { description: "   " })).toEqual({
      description: null,
    });
  });
});
