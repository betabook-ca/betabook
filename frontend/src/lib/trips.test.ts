import { describe, expect, it } from "vitest";

import { formatTripDates, tripAnalyticsHref, tripHref, tripLogbookHref, tripStatus } from "./trips";

const BISHOP = { startDate: "2026-03-10", endDate: "2026-03-20" };

describe("tripStatus", () => {
  it("reads the window against the caller's own day, inclusive at both ends", () => {
    expect(tripStatus(BISHOP, "2026-03-09")).toBe("upcoming");
    expect(tripStatus(BISHOP, "2026-03-10")).toBe("current");
    expect(tripStatus(BISHOP, "2026-03-20")).toBe("current");
    expect(tripStatus(BISHOP, "2026-03-21")).toBe("past");
  });
});

describe("hrefs", () => {
  it("builds the detail path under the owner's logbook", () => {
    expect(tripHref("alex", 7)).toBe("/users/alex/trips/7");
    expect(tripAnalyticsHref("alex", 7)).toBe("/users/alex/trips/7/analytics");
  });

  it("links to the Journal and Sends filtered to the trip's dates", () => {
    expect(tripLogbookHref("alex", "journal", BISHOP)).toBe(
      "/users/alex/journal?dateFrom=2026-03-10&dateTo=2026-03-20",
    );
    expect(tripLogbookHref("alex", "sends", BISHOP)).toBe(
      "/users/alex/sends?dateFrom=2026-03-10&dateTo=2026-03-20",
    );
  });
});

describe("formatTripDates", () => {
  it("says a single-day trip once rather than twice", () => {
    expect(formatTripDates("2026-03-10", "2026-03-10")).toBe(
      formatTripDates("2026-03-10", "2026-03-10"),
    );
    expect(formatTripDates("2026-03-10", "2026-03-10")).not.toContain("–");
  });

  it("joins a range with an en dash", () => {
    expect(formatTripDates("2026-03-10", "2026-03-20")).toContain("–");
  });
});
