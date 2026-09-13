import { describe, expect, it } from "vitest";

import {
  DEFAULT_RATING_RANGE,
  MAX_RATING,
  parseRatingRange,
  RATING_OPTIONS,
} from "./climb-stats-filter";

describe("RATING_OPTIONS / DEFAULT_RATING_RANGE", () => {
  it("keeps index = rating value, with the 'Any' sentinel at 0", () => {
    expect(RATING_OPTIONS[0]).toBe("Any");
    expect(RATING_OPTIONS).toHaveLength(MAX_RATING + 1);
    expect(RATING_OPTIONS[MAX_RATING]).toBe(String(MAX_RATING));
  });

  it("keeps the default range meaning 'filter inactive' on both bounds", () => {
    // 0 on both sides is the "Any" sentinel, so neither bound applies — the
    // exact encoding old shared URLs carry.
    expect(DEFAULT_RATING_RANGE).toEqual([0, 0]);
  });
});

describe("parseRatingRange", () => {
  it("returns the default (inactive) range when the param is absent or malformed", () => {
    expect(parseRatingRange(undefined)).toEqual(DEFAULT_RATING_RANGE);
    expect(parseRatingRange("3")).toEqual(DEFAULT_RATING_RANGE);
    expect(parseRatingRange(["3", "nope"])).toEqual(DEFAULT_RATING_RANGE);
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
