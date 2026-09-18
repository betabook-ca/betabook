import { describe, expect, it } from "vitest";

import { jaroWinkler } from "./fuzzy.ts";

describe("jaroWinkler", () => {
  it("scores identical strings as 1", () => {
    expect(jaroWinkler("millennium", "millennium")).toBe(1);
  });

  it("scores a single interior typo close to 1", () => {
    // "Millennium" vs "Millenium" — a real pair of duplicate area names
    // in Betabook's production Uncategorized bucket.
    expect(jaroWinkler("millennium", "millenium")).toBeGreaterThan(0.9);
  });

  it("scores completely different strings low", () => {
    expect(jaroWinkler("millennium", "sandstone")).toBeLessThan(0.5);
  });

  it("weights a shared prefix higher than a shared suffix", () => {
    const sharedPrefix = jaroWinkler("boulders", "boulderz");
    const sharedSuffix = jaroWinkler("zoulders", "boulders");
    expect(sharedPrefix).toBeGreaterThan(sharedSuffix);
  });

  it("returns 0 for an empty string against a non-empty one", () => {
    expect(jaroWinkler("", "anything")).toBe(0);
  });

  it("is symmetric", () => {
    expect(jaroWinkler("nö", "nø")).toBeCloseTo(jaroWinkler("nø", "nö"), 10);
  });
});
