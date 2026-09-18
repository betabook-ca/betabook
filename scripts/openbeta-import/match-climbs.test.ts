import { describe, expect, it } from "vitest";

import { matchClimb } from "./match-climbs.ts";
import type { BetabookClimbCandidate } from "./types.ts";

function climb(
  overrides: Partial<BetabookClimbCandidate> & { id: number },
): BetabookClimbCandidate {
  return {
    name: "Climb",
    type: "boulder",
    grade: null,
    areaId: 1,
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

describe("matchClimb", () => {
  it("creates when no candidate shares the route's discipline", () => {
    const candidates = [climb({ id: 1, name: "Test Highball", type: "sport" })];
    expect(matchClimb("Test Highball", "boulder", null, candidates)).toEqual({ kind: "create" });
  });

  it("matches a single same-discipline exact name", () => {
    const candidate = climb({ id: 1, name: "Test Highball", type: "boulder" });
    const candidates = [candidate, climb({ id: 2, name: "Test Highball", type: "sport" })];
    expect(matchClimb("Test Highball", "boulder", null, candidates)).toEqual({
      kind: "match",
      candidate,
      method: "exact",
    });
  });

  it("stays ambiguous on a same-name, same-discipline tie with no grade to break it", () => {
    const candidates = [
      climb({ id: 1, name: "Superfly", type: "boulder", grade: 5 }),
      climb({ id: 2, name: "Superfly", type: "boulder", grade: 6 }),
    ];
    expect(matchClimb("Superfly", "boulder", null, candidates)).toEqual({
      kind: "ambiguous",
      candidates,
    });
  });

  it("breaks a name tie by an exact grade match", () => {
    const target = climb({ id: 1, name: "Superfly", type: "boulder", grade: 5 });
    const candidates = [target, climb({ id: 2, name: "Superfly", type: "boulder", grade: 6 })];
    expect(matchClimb("Superfly", "boulder", 5, candidates)).toEqual({
      kind: "match",
      candidate: target,
      method: "fuzzy",
    });
  });

  it("stays ambiguous when the grade also fails to distinguish the tie", () => {
    const candidates = [
      climb({ id: 1, name: "Superfly", type: "boulder", grade: 5 }),
      climb({ id: 2, name: "Superfly", type: "boulder", grade: 5 }),
    ];
    expect(matchClimb("Superfly", "boulder", 5, candidates)).toEqual({
      kind: "ambiguous",
      candidates,
    });
  });

  it("creates when the name has no confident match among same-discipline candidates", () => {
    const candidates = [climb({ id: 1, name: "Totally Different", type: "boulder" })];
    expect(matchClimb("Superfly", "boulder", null, candidates)).toEqual({ kind: "create" });
  });
});
