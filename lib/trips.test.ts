import { describe, expect, it } from "vitest";

import { MAX_TRIP_NAME, formatTripDates, tripHref, tripInputSchema, tripStatus } from "./trips";

const BISHOP = { startDate: "2026-03-10", endDate: "2026-03-20" };

describe("tripInputSchema", () => {
  const valid = { name: "Bishop", description: "Buttermilks", ...BISHOP };

  it("accepts a trip and trims its name", () => {
    const parsed = tripInputSchema.parse({ ...valid, name: "  Bishop  " });
    expect(parsed).toEqual({
      name: "Bishop",
      description: "Buttermilks",
      startDate: "2026-03-10",
      endDate: "2026-03-20",
    });
  });

  it("accepts a one-day trip, where both dates are the same", () => {
    expect(
      tripInputSchema.parse({ ...valid, startDate: "2026-03-10", endDate: "2026-03-10" }),
    ).toMatchObject({ startDate: "2026-03-10", endDate: "2026-03-10" });
  });

  it("rejects an end date before the start date", () => {
    const result = tripInputSchema.safeParse({
      ...valid,
      startDate: "2026-03-20",
      endDate: "2026-03-10",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      message: "End date must be on or after start date.",
      path: ["endDate"],
    });
  });

  it("rejects a date that looks ISO but is not a real day", () => {
    expect(tripInputSchema.safeParse({ ...valid, startDate: "2026-02-30" }).success).toBe(false);
    expect(tripInputSchema.safeParse({ ...valid, startDate: "not-a-date" }).success).toBe(false);
  });

  it("rejects a name that is blank or only whitespace", () => {
    expect(tripInputSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
    expect(tripInputSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });

  it("rejects a name past the length the card can show", () => {
    expect(tripInputSchema.safeParse({ ...valid, name: "x".repeat(MAX_TRIP_NAME) }).success).toBe(
      true,
    );
    expect(
      tripInputSchema.safeParse({ ...valid, name: "x".repeat(MAX_TRIP_NAME + 1) }).success,
    ).toBe(false);
  });

  it("stores an empty description as null rather than an empty string", () => {
    expect(tripInputSchema.parse({ ...valid, description: "   " }).description).toBeNull();
  });
});

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
