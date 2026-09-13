import { describe, expect, it } from "vitest";

import { searchParamsToRecord } from "@/lib/url-params";

import {
  areaClimbsFilterToSearchParams,
  DEFAULT_AREA_CLIMBS_FILTER,
  DEFAULT_AREA_CLIMBS_SORT,
  parseAreaClimbsFilter,
  parseAreaClimbsSort,
  type AreaClimbsFilter,
} from "./area-climbs-filter";

// Same fixed-point invariant as climb-filter.test.ts: the area page's
// debounced filter navigation compares built hrefs against the canonical
// re-serialization of the current URL, so parse -> serialize must be stable.
function reserialize(params: URLSearchParams): string {
  const record = searchParamsToRecord(params);
  return areaClimbsFilterToSearchParams(
    parseAreaClimbsSort(record),
    parseAreaClimbsFilter(record),
  ).toString();
}

describe("area climbs filter serialization", () => {
  it("reaches a fixed point from a bare URL", () => {
    const canonical = reserialize(new URLSearchParams());
    expect(reserialize(new URLSearchParams(canonical))).toBe(canonical);
  });

  it("serializes the parsed bare URL like the default filter", () => {
    expect(reserialize(new URLSearchParams())).toBe(
      areaClimbsFilterToSearchParams(
        DEFAULT_AREA_CLIMBS_SORT,
        DEFAULT_AREA_CLIMBS_FILTER,
      ).toString(),
    );
  });

  it("round-trips a fully populated filter", () => {
    const filter: AreaClimbsFilter = {
      ...DEFAULT_AREA_CLIMBS_FILTER,
      name: "Nose",
      disciplines: ["trad"],
      tradRange: [5, 25],
      ratingRange: [3, 5],
      minAscents: 10,
    };
    const params = areaClimbsFilterToSearchParams("name_asc", filter);
    expect(params.toString()).toBe(
      "sort=name_asc&name=Nose&discipline=trad&tradRange=5&tradRange=25&ratingRange=3&ratingRange=5&minAscents=10",
    );
    const record = searchParamsToRecord(params);

    expect(parseAreaClimbsSort(record)).toBe("name_asc");
    expect(parseAreaClimbsFilter(record)).toEqual(filter);
    expect(reserialize(params)).toBe(params.toString());
  });
});
