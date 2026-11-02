import { describe, expect, it } from "vitest";

import {
  DEFAULT_ANALYTICS_LAYOUT,
  TRIP_ANALYTICS_LAYOUT,
  analyticsLayoutSchema,
  cardAppliesTo,
  moveAnalyticsItem,
  parseAnalyticsLayout,
} from "./analytics-layout";

describe("trip analytics layout", () => {
  it("shows the summary tiles and the grade pyramid", () => {
    expect(TRIP_ANALYTICS_LAYOUT).toEqual({
      cards: ["sends", "hardest", "flash", "onsight", "days"],
      charts: ["pyramid"],
    });
    expect(analyticsLayoutSchema.safeParse(TRIP_ANALYTICS_LAYOUT).success).toBe(true);
  });
});

describe("cards per discipline", () => {
  it("drops the onsight card for bouldering only", () => {
    expect(cardAppliesTo("onsight", "boulder")).toBe(false);
    expect(cardAppliesTo("onsight", "sport")).toBe(true);
    expect(cardAppliesTo("onsight", "trad")).toBe(true);
    expect(cardAppliesTo("flash", "boulder")).toBe(true);
  });
});

describe("saved analytics layouts", () => {
  it("reads the combined firstTry card as flash followed by onsight", () => {
    expect(
      parseAnalyticsLayout({ cards: ["sends", "firstTry", "days"], charts: ["flashRate"] }),
    ).toEqual({ cards: ["sends", "flash", "onsight", "days"], charts: ["flashRate"] });
    // A layout that already places onsight keeps it where it is.
    expect(parseAnalyticsLayout({ cards: ["onsight", "firstTry"], charts: [] })).toEqual({
      cards: ["onsight", "flash"],
      charts: [],
    });
  });
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
