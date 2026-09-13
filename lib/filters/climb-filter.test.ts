import { describe, expect, it } from "vitest";

import { DEFAULT_CLIMB_LIST_SORT, parseClimbListSort } from "@/lib/climb-list-sort";
import { searchParamsToRecord } from "@/lib/url-params";

import {
  climbFilterToSearchParams,
  DEFAULT_CLIMB_FILTER,
  parseClimbFilter,
  type ClimbFilter,
} from "./climb-filter";

// The debounced filter navigation only fires when the href built from local
// state differs from the canonical href of the current URL (see
// hooks/use-debounced-replace.ts). That comparison relies on serialization
// being a fixed point of parse -> serialize: any URL, parsed and
// re-serialized, must re-serialize to the same string.
function reserialize(params: URLSearchParams): string {
  const record = searchParamsToRecord(params);
  return climbFilterToSearchParams(parseClimbListSort(record), parseClimbFilter(record)).toString();
}

describe("climb filter serialization", () => {
  it("round trips an exact area identity independently of its display name", () => {
    const parsed = parseClimbFilter({ areaId: "2", areaName: "Test Boulders" });
    expect(parsed).toMatchObject({ areaId: 2 });
    const params = climbFilterToSearchParams("name_asc", parsed);
    expect(params.get("areaId")).toBe("2");
    expect(parseClimbFilter(searchParamsToRecord(params))).toEqual(parsed);
  });

  it.each(["0", "-1", "1.5", "Infinity", "9007199254740992", "oops"])(
    "does not broaden a malformed selected area (%s) into a global search",
    (areaId) => {
      expect(parseClimbFilter({ areaId })).toMatchObject({ areaId: 0 });
    },
  );
  it("reaches a fixed point from a bare URL", () => {
    const canonical = reserialize(new URLSearchParams());
    expect(reserialize(new URLSearchParams(canonical))).toBe(canonical);
  });

  it("serializes the parsed bare URL like the default filter", () => {
    expect(reserialize(new URLSearchParams())).toBe(
      climbFilterToSearchParams(DEFAULT_CLIMB_LIST_SORT, DEFAULT_CLIMB_FILTER).toString(),
    );
  });

  it("round-trips a fully populated filter", () => {
    const filter: ClimbFilter = {
      ...DEFAULT_CLIMB_FILTER,
      name: "Midnight Lightning",
      areaName: "Yosemite",
      disciplines: ["boulder", "sport"],
      boulderRange: [2, 8],
      sportRange: [1, 20],
      ratingRange: [2, 5],
      minAscents: 3,
    };
    const params = climbFilterToSearchParams("grade_desc", filter);
    expect(params.toString()).toBe(
      "sort=grade_desc&name=Midnight+Lightning&areaName=Yosemite&discipline=boulder&discipline=sport&boulderRange=2&boulderRange=8&sportRange=1&sportRange=20&ratingRange=2&ratingRange=5&minAscents=3",
    );
    const record = searchParamsToRecord(params);

    expect(parseClimbListSort(record)).toBe("grade_desc");
    expect(parseClimbFilter(record)).toEqual(filter);
    expect(reserialize(params)).toBe(params.toString());
  });
});
