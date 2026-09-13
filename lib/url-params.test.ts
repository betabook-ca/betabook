import { describe, expect, it } from "vitest";

import {
  DEFAULT_SUGGESTION_LIMIT,
  MAX_PAGINATION_OFFSET,
  MAX_SUGGESTION_LIMIT,
  offsetReachesPaginationLimit,
  pageReachesPaginationLimit,
  parseAscentStyles,
  parseOffset,
  parsePage,
  parseDisciplines,
  parseSuggestionLimit,
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

  it("supports a custom key", () => {
    expect(parseDisciplines({ style: "sport" }, "style")).toEqual(["sport"]);
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

  it("supports a custom key", () => {
    expect(parseAscentStyles({ style: "redpoint" }, "style")).toEqual(["redpoint"]);
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

describe("parseSuggestionLimit", () => {
  function limitOf(query: string) {
    return parseSuggestionLimit(new URLSearchParams(query));
  }

  it("returns null when absent, which is what the paginated path sends", () => {
    expect(limitOf("name=squamish&page=2")).toBeNull();
  });

  it("reads a valid limit", () => {
    expect(limitOf("limit=5")).toBe(5);
  });

  it("caps the limit so a suggestion lookup can't ask for a full table read", () => {
    expect(limitOf(`limit=${MAX_SUGGESTION_LIMIT + 500}`)).toBe(MAX_SUGGESTION_LIMIT);
  });

  it.each(["limit=0", "limit=-5", "limit=abc", "limit="])("keeps %s bounded", (query) => {
    expect(limitOf(query)).toBe(DEFAULT_SUGGESTION_LIMIT);
  });

  it("truncates a fractional limit rather than rejecting it", () => {
    expect(limitOf("limit=3.7")).toBe(3);
  });
});

describe("parsePage", () => {
  const pageOf = (query: string, pageSize = 25) => parsePage(new URLSearchParams(query), pageSize);

  it("reads a 1-based page", () => {
    expect(pageOf("page=3")).toBe(3);
  });

  it.each(["", "page=abc", "page=0", "page=-4"])("reads %s as page 1", (query) => {
    expect(pageOf(query)).toBe(1);
  });

  it("leaves a page inside the cap alone", () => {
    expect(pageOf("page=100", 25)).toBe(100);
  });

  it("returns terminal past MAX_PAGINATION_OFFSET", () => {
    expect(pageOf("page=999999", 25)).toBeNull();
    expect(pageOf("page=999999", 50)).toBeNull();
  });

  it("keeps the final page inside the budget and marks it terminal", () => {
    const lastPage = MAX_PAGINATION_OFFSET / 25 + 1;
    expect(pageOf(`page=${lastPage}`, 25)).toBe(lastPage);
    expect(pageReachesPaginationLimit(lastPage, 25)).toBe(true);
  });

  // Number("1e15") is an integer as far as Number.isInteger is concerned, so
  // a bare integer check would have let this straight through to the OFFSET.
  it("makes exponent notation terminal", () => {
    expect(pageOf("page=1e15", 25)).toBeNull();
  });
});

describe("parseOffset", () => {
  const offsetOf = (query: string) => parseOffset(new URLSearchParams(query));

  it("reads a row offset", () => {
    expect(offsetOf("offset=40")).toBe(40);
  });

  it.each(["", "offset=abc", "offset=1.5", "offset=-10"])("reads %s as 0", (query) => {
    expect(offsetOf(query)).toBe(0);
  });

  it("returns terminal past MAX_PAGINATION_OFFSET", () => {
    expect(offsetOf("offset=1e15")).toBeNull();
    expect(offsetOf(`offset=${MAX_PAGINATION_OFFSET + 1}`)).toBeNull();
  });

  it("keeps offset 10,000 and marks its response terminal", () => {
    expect(offsetOf(`offset=${MAX_PAGINATION_OFFSET}`)).toBe(MAX_PAGINATION_OFFSET);
    expect(offsetReachesPaginationLimit(MAX_PAGINATION_OFFSET, 200)).toBe(true);
  });
});
