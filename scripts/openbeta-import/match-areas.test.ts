import { describe, expect, it } from "vitest";

import { haversineDistanceKm, matchArea } from "./match-areas.ts";
import type { BetabookAreaCandidate, OpenBetaAreaRow } from "./types.ts";

function area(overrides: Partial<BetabookAreaCandidate> & { id: number }): BetabookAreaCandidate {
  return {
    name: "Area",
    parentId: null,
    latitude: null,
    longitude: null,
    ancestors: [],
    ...overrides,
  };
}

function openBetaArea(overrides: Partial<OpenBetaAreaRow> = {}): OpenBetaAreaRow {
  return {
    uuid: "ob-1",
    areaName: "Millennium",
    pathTokens: [],
    parentUuid: null,
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

describe("haversineDistanceKm", () => {
  it("is zero for identical points", () => {
    const point = { latitude: 40, longitude: -105 };
    expect(haversineDistanceKm(point, point)).toBe(0);
  });

  it("roughly matches a known distance (NYC to LA, ~3940km)", () => {
    const nyc = { latitude: 40.7128, longitude: -74.006 };
    const la = { latitude: 34.0522, longitude: -118.2437 };
    expect(haversineDistanceKm(nyc, la)).toBeGreaterThan(3900);
    expect(haversineDistanceKm(nyc, la)).toBeLessThan(4000);
  });
});

describe("matchArea", () => {
  it("creates when there are no candidates", () => {
    expect(matchArea(openBetaArea(), [])).toEqual({ kind: "create" });
  });

  it("matches a single exact candidate", () => {
    const candidate = area({ id: 1, name: "Millennium" });
    expect(matchArea(openBetaArea(), [candidate])).toEqual({
      kind: "match",
      candidate,
      method: "exact",
    });
  });

  it("stays ambiguous when candidates tie on name and neither has coordinates", () => {
    const candidates = [area({ id: 1, name: "Millennium" }), area({ id: 2, name: "millennium" })];
    expect(matchArea(openBetaArea(), candidates)).toEqual({ kind: "ambiguous", candidates });
  });

  it("breaks a naming tie by decisive GPS proximity", () => {
    const near = area({ id: 1, name: "Millennium", latitude: 40.01, longitude: -105.01 });
    const far = area({ id: 2, name: "millennium", latitude: 10, longitude: 10 });
    const decision = matchArea(openBetaArea({ latitude: 40, longitude: -105 }), [near, far]);
    expect(decision).toEqual({ kind: "match", candidate: near, method: "fuzzy" });
  });

  it("stays ambiguous when tied candidates are similarly close (well under the 2x ratio)", () => {
    const a = area({ id: 1, name: "Millennium", latitude: 40.01, longitude: -105.01 });
    const b = area({ id: 2, name: "millennium", latitude: 40.013, longitude: -105.013 });
    const decision = matchArea(openBetaArea({ latitude: 40, longitude: -105 }), [a, b]);
    expect(decision.kind).toBe("ambiguous");
  });

  it("stays ambiguous when only some tied candidates have coordinates", () => {
    const withCoords = area({ id: 1, name: "Millennium", latitude: 40, longitude: -105 });
    const withoutCoords = area({ id: 2, name: "millennium" });
    const decision = matchArea(openBetaArea({ latitude: 40, longitude: -105 }), [
      withCoords,
      withoutCoords,
    ]);
    expect(decision.kind).toBe("ambiguous");
  });
});
