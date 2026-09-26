import { describe, expect, it } from "vitest";

import { parseId } from "./parse-id";

describe("parseId", () => {
  it("accepts the canonical decimal form of a positive integer, as a string or a number", () => {
    expect(parseId("1")).toBe(1);
    expect(parseId("9007199254740991")).toBe(9007199254740991);
    expect(parseId(42)).toBe(42);
  });

  it("rejects absent, blank, zero and negative ids", () => {
    expect(parseId(null)).toBeNull();
    expect(parseId("")).toBeNull();
    expect(parseId(" ")).toBeNull();
    expect(parseId("0")).toBeNull();
    expect(parseId("-3")).toBeNull();
    expect(parseId(0)).toBeNull();
    expect(parseId(-3)).toBeNull();
  });

  it("rejects the aliases Number() would accept, so every id has one address", () => {
    for (const alias of ["1e3", "0x10", " 5 ", "007", "1.0", "+1"]) {
      expect(parseId(alias)).toBeNull();
    }
    expect(parseId(1.5)).toBeNull();
    expect(parseId(Number.NaN)).toBeNull();
    expect(parseId(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
    expect(parseId("9007199254740992")).toBeNull();
  });
});
