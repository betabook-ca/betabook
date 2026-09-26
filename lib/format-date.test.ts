import { describe, expect, it } from "vitest";

import { daysBetween, describeDaysAgo, formatDate, localToday } from "./format-date";

describe("localToday", () => {
  it("formats the civil date in the runtime's own timezone", () => {
    expect(localToday(new Date(2026, 8, 25, 12))).toBe("2026-09-25");
    expect(localToday(new Date(2026, 0, 1, 0, 0, 1))).toBe("2026-01-01");
  });
});

describe("formatDate", () => {
  it("formats a stored civil date", () => {
    expect(formatDate("2026-08-28")).toBe("Aug 28, 2026");
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatDate("2025-12-31")).toBe("Dec 31, 2025");
  });

  it("falls back to '—' for a missing date", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("returns an unparseable string as-is", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("daysBetween", () => {
  it("counts whole days across a month and a leap day", () => {
    expect(daysBetween("2026-09-01", "2026-09-11")).toBe(10);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2026-09-11", "2026-09-11")).toBe(0);
  });

  it("stays whole across a daylight-saving change", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-11-01", "2026-11-02")).toBe(1);
  });

  it("returns a negative count for a future date and null for nonsense", () => {
    expect(daysBetween("2026-09-11", "2026-09-04")).toBe(-7);
    expect(daysBetween("not-a-date", "2026-09-11")).toBeNull();
    expect(daysBetween("2026-09-11", "")).toBeNull();
  });
});

describe("describeDaysAgo", () => {
  it("names the recent days in full", () => {
    expect(describeDaysAgo(0)).toBe("Today");
    expect(describeDaysAgo(-3)).toBe("Today");
    expect(describeDaysAgo(1)).toBe("Yesterday");
    expect(describeDaysAgo(6)).toBe("6 days ago");
  });

  it("floors longer gaps into the coarser unit", () => {
    expect(describeDaysAgo(7)).toBe("1 week ago");
    expect(describeDaysAgo(20)).toBe("2 weeks ago");
    expect(describeDaysAgo(29)).toBe("4 weeks ago");
    expect(describeDaysAgo(30)).toBe("1 month ago");
    expect(describeDaysAgo(364)).toBe("12 months ago");
    expect(describeDaysAgo(365)).toBe("1 year ago");
    expect(describeDaysAgo(900)).toBe("2 years ago");
  });
});
