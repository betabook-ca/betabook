import { describe, expect, it } from "vitest";

import { MAX_RATING, parseRatingRange } from "./climb-stats-filter";

describe("parseRatingRange", () => {
  it("returns the default (inactive) range when the param is absent or malformed", () => {
    expect(parseRatingRange(undefined)).toEqual([0, 0]);
    expect(parseRatingRange("3")).toEqual([0, 0]);
    expect(parseRatingRange(["3", "nope"])).toEqual([0, 0]);
  });

  it("parses two finite values as [min, max]", () => {
    expect(parseRatingRange(["2", "4"])).toEqual([2, 4]);
  });

  it("passes the 'Any' sentinel (0) through on either bound", () => {
    // [0, 0] is what the old, broken "Any"-max UI wrote into shared URLs —
    // it must parse as "both bounds inactive", not "avg rating exactly 0".
    expect(parseRatingRange(["0", "0"])).toEqual([0, 0]);
    expect(parseRatingRange(["3", "0"])).toEqual([3, 0]);
  });

  it("clamps out-of-scale bounds onto 0..MAX_RATING", () => {
    expect(parseRatingRange(["-2", "99"])).toEqual([0, MAX_RATING]);
  });
});
