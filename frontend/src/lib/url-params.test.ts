import { describe, expect, it } from "vitest";

import {
  parseAscentStyles,
  parseDisciplines,
  searchParamsToRecord,
  toArray,
  toRange,
} from "./url-params";

describe("toArray", () => {
  it("returns an empty array for undefined", () => {
    expect(toArray(undefined)).toEqual([]);
  });

  it("wraps a single value in an array", () => {
    expect(toArray("boulder")).toEqual(["boulder"]);
  });

  it("passes an array through unchanged", () => {
    expect(toArray(["boulder", "sport"])).toEqual(["boulder", "sport"]);
  });
});

describe("toRange", () => {
  const fallback: [number, number] = [0, 10];

  it("returns the fallback when fewer than two finite values are present", () => {
    expect(toRange(undefined, fallback)).toEqual(fallback);
    expect(toRange("3", fallback)).toEqual(fallback);
    expect(toRange(["3", "nope"], fallback)).toEqual(fallback);
  });

  it("returns [min, max] for two finite values", () => {
    expect(toRange(["5", "2"], fallback)).toEqual([2, 5]);
  });
});

describe("parseDisciplines", () => {
  it("filters to only valid disciplines", () => {
    expect(parseDisciplines({ discipline: ["boulder", "invalid", "trad"] })).toEqual([
      "boulder",
      "trad",
    ]);
  });

  it("returns an empty array when the key is absent", () => {
    expect(parseDisciplines({})).toEqual([]);
  });
});

describe("parseAscentStyles", () => {
  it("filters to only valid ascent styles", () => {
    expect(parseAscentStyles({ ascentStyle: ["flash", "invalid", "onsight"] })).toEqual([
      "flash",
      "onsight",
    ]);
  });

  it("returns an empty array when the key is absent", () => {
    expect(parseAscentStyles({})).toEqual([]);
  });
});

describe("searchParamsToRecord", () => {
  it("flattens a URLSearchParams into arrays of values per key", () => {
    const params = new URLSearchParams();
    params.append("discipline", "boulder");
    params.append("discipline", "sport");
    params.append("page", "2");

    expect(searchParamsToRecord(params)).toEqual({
      discipline: ["boulder", "sport"],
      page: ["2"],
    });
  });

  it("returns an empty record for empty search params", () => {
    expect(searchParamsToRecord(new URLSearchParams())).toEqual({});
  });
});
