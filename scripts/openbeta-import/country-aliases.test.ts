import { describe, expect, it } from "vitest";

import { normalizeCountryName } from "./country-aliases.ts";

describe("normalizeCountryName", () => {
  it("maps a known OpenBeta spelling to Betabook's own", () => {
    expect(normalizeCountryName("USA")).toBe("United States");
    expect(normalizeCountryName("Vietnam")).toBe("Viet Nam");
    expect(normalizeCountryName("People's Republic of China")).toBe("China");
    expect(normalizeCountryName("Lao People's Democratic Republic")).toBe("Laos");
  });

  it("is case-insensitive", () => {
    expect(normalizeCountryName("usa")).toBe("United States");
  });

  it("leaves an unknown name unchanged", () => {
    expect(normalizeCountryName("Narnia")).toBe("Narnia");
  });

  it("leaves an already-Betabook-spelled name unchanged", () => {
    expect(normalizeCountryName("United States")).toBe("United States");
  });
});
