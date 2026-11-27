import { describe, expect, it } from "vitest";

import { formatCount } from "./format";

describe("formatCount", () => {
  it("uses the singular noun for exactly one", () => {
    expect(formatCount(1, "ascent")).toBe("1 ascent");
  });

  it("pluralizes zero and many", () => {
    expect(formatCount(0, "ascent")).toBe("0 ascents");
    expect(formatCount(42, "ascent")).toBe("42 ascents");
  });

  it("accepts an irregular plural", () => {
    expect(formatCount(2, "try", "tries")).toBe("2 tries");
  });

  it("groups thousands", () => {
    expect(formatCount(1234, "climb")).toBe("1,234 climbs");
  });
});
