import { describe, expect, it } from "vitest";

import { createClimbListMeta, mergeClimbListMeta } from "./climb-list-pages";

describe("mergeClimbListMeta", () => {
  it("accumulates metadata from a newly loaded page", () => {
    const current = createClimbListMeta({
      sendStats: {
        1: { avgRating: null, sendCount: 1, avgSuggestedGrade: null },
      },
      areaBreadcrumbs: { 1: [{ id: 10, name: "First" }] },
      sentClimbIds: [1],
    });
    const next = createClimbListMeta({
      sendStats: {
        30: { avgRating: 5, sendCount: 2, avgSuggestedGrade: null },
      },
      areaBreadcrumbs: { 30: [{ id: 11, name: "Second" }] },
      sentClimbIds: [30],
    });

    const beforeCurrent = structuredClone(current);
    const beforeNext = structuredClone(next);
    const merged = mergeClimbListMeta(current, next);
    expect(merged.sendStats).toEqual({
      1: { avgRating: null, sendCount: 1, avgSuggestedGrade: null },
      30: { avgRating: 5, sendCount: 2, avgSuggestedGrade: null },
    });
    expect(merged.areaBreadcrumbs).toEqual({
      1: [{ id: 10, name: "First" }],
      30: [{ id: 11, name: "Second" }],
    });
    expect(current).toEqual(beforeCurrent);
    expect(next).toEqual(beforeNext);
    expect(merged.sentClimbIds).toEqual(new Set([1, 30]));
    expect(merged.sendStats[30]).toEqual({
      avgRating: 5,
      sendCount: 2,
      avgSuggestedGrade: null,
    });
    expect(merged.areaBreadcrumbs[30]).toEqual([{ id: 11, name: "Second" }]);
  });

  it("replaces overlapping metadata with the incoming page and deduplicates sent ids", () => {
    const current = createClimbListMeta({
      sendStats: { 1: { avgRating: 2, sendCount: 1, avgSuggestedGrade: null } },
      areaBreadcrumbs: { 1: [{ id: 10, name: "Old" }] },
      sentClimbIds: [1],
    });
    const incoming = createClimbListMeta({
      sendStats: { 1: { avgRating: 4, sendCount: 2, avgSuggestedGrade: 5 } },
      areaBreadcrumbs: { 1: [{ id: 11, name: "New" }] },
      sentClimbIds: [1],
    });
    expect(mergeClimbListMeta(current, incoming)).toEqual(incoming);
    expect(current.sendStats[1].avgRating).toBe(2);
    expect(current.areaBreadcrumbs[1]).toEqual([{ id: 10, name: "Old" }]);
  });

  it("keeps signed-out metadata unauthenticated", () => {
    const current = createClimbListMeta({
      sendStats: {},
      areaBreadcrumbs: {},
    });
    const next = createClimbListMeta({
      sendStats: {},
      areaBreadcrumbs: {},
    });

    expect(mergeClimbListMeta(current, next).sentClimbIds).toBeUndefined();
  });
});
