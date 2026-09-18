import { describe, expect, it } from "vitest";

import { resolveByName } from "./name-resolve.ts";

type Item = { id: number; name: string };
const named = (c: Item) => c.name;

describe("resolveByName", () => {
  it("creates when there are no candidates", () => {
    expect(resolveByName("Anything", [], named)).toEqual({ kind: "create" });
  });

  it("matches a single exact (case/whitespace-insensitive) candidate", () => {
    const candidates: Item[] = [{ id: 1, name: "  Millennium  " }];
    expect(resolveByName("millennium", candidates, named)).toEqual({
      kind: "match",
      candidate: candidates[0],
      method: "exact",
    });
  });

  it("is ambiguous when more than one candidate shares the exact folded name", () => {
    const candidates: Item[] = [
      { id: 1, name: "Millennium" },
      { id: 2, name: "millennium" },
    ];
    const decision = resolveByName("Millennium", candidates, named);
    expect(decision).toEqual({ kind: "ambiguous", candidates });
  });

  it("falls back to a loose key match past punctuation/accents", () => {
    const candidates: Item[] = [{ id: 1, name: "Nö" }];
    expect(resolveByName("No", candidates, named)).toEqual({
      kind: "match",
      candidate: candidates[0],
      method: "exact",
    });
  });

  it("falls back to a fuzzy match for a near-miss spelling", () => {
    const candidates: Item[] = [
      { id: 1, name: "Millennium" },
      { id: 2, name: "Sandstone Wall" },
    ];
    const decision = resolveByName("Millenium", candidates, named);
    expect(decision).toEqual({ kind: "match", candidate: candidates[0], method: "fuzzy" });
  });

  it("creates when no candidate clears the fuzzy threshold", () => {
    const candidates: Item[] = [{ id: 1, name: "Completely Different Crag" }];
    expect(resolveByName("Millennium", candidates, named)).toEqual({ kind: "create" });
  });

  it("is ambiguous when two candidates tie at the same top fuzzy score", () => {
    const candidates: Item[] = [
      { id: 1, name: "Millenium" },
      { id: 2, name: "Millenium" },
    ];
    const decision = resolveByName("Millennium", candidates, named);
    expect(decision.kind).toBe("ambiguous");
  });
});
