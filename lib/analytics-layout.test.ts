import { describe, expect, it } from "vitest";

import {
  DEFAULT_ANALYTICS_LAYOUT,
  moveAnalyticsItem,
  parseAnalyticsLayout,
} from "./analytics-layout";

describe("saved analytics layouts", () => {
  it("accepts only visible ordered lists and never appends optional items", () => {
    const layout = { cards: ["partner", "sends"], charts: ["volume"] };
    expect(parseAnalyticsLayout(layout)).toEqual(layout);
  });
  it("preserves intentionally empty sections", () => {
    expect(parseAnalyticsLayout({ cards: [], charts: [] })).toEqual({ cards: [], charts: [] });
  });
  it.each([
    { version: 1, cards: ["partner"], charts: ["volume"], hidden: [] },
    { version: 2, cards: ["partner"], charts: ["volume"] },
    { cards: ["partner"], charts: ["volume"], hidden: [] },
    { cards: ["sends", "sends"], charts: [] },
    { cards: ["calendar"], charts: [] },
    { cards: ["obsolete"], charts: [] },
    { cards: [], charts: ["sends"] },
    { cards: "bad", charts: [] },
    null,
    "bad",
    {},
  ])("starts fresh for invalid stored preferences: %j", (value) => {
    expect(parseAnalyticsLayout(value)).toEqual(DEFAULT_ANALYTICS_LAYOUT);
  });
});
describe("moving analytics items", () => {
  it("moves before or after an existing item without duplicating or losing cards", () => {
    const items = ["sends", "hardest", "days"];
    expect(moveAnalyticsItem(items, "days", "sends")).toEqual(["days", "sends", "hardest"]);
    expect(moveAnalyticsItem(items, "sends", "hardest", "after")).toEqual([
      "hardest",
      "sends",
      "days",
    ]);
    expect(items).toEqual(["sends", "hardest", "days"]);
  });
  it("ignores cross-section or missing targets and self drops", () => {
    const items = ["sends", "hardest"];
    expect(moveAnalyticsItem(items, "calendar", "sends")).toEqual(items);
    expect(moveAnalyticsItem(items, "sends", "calendar")).toEqual(items);
    expect(moveAnalyticsItem(items, "sends", "sends")).toEqual(items);
  });
});
