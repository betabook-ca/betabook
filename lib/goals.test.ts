import { expect, it } from "vitest";

import { goalInputSchema, goalToday, goalWindow } from "./goals";

it("uses calendar weeks and handles leap-month and year boundaries", () => {
  expect(goalWindow("week", "2026-09-13", "2026-09-13")).toEqual({
    startDate: "2026-09-07",
    endDate: "2026-09-13",
  });
  expect(goalWindow("week", "2026-09-14", "2026-09-14")).toEqual({
    startDate: "2026-09-14",
    endDate: "2026-09-20",
  });
  expect(goalWindow("month", "2028-02-12", "2028-02-12").endDate).toBe("2028-02-29");
  expect(goalWindow("year", "2026-12-31", "2026-12-31")).toEqual({
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  });
  expect(goalToday("America/Los_Angeles", new Date("2026-09-14T01:00:00Z"))).toBe("2026-09-13");
});
it("rejects invalid dates, timezones, targets and grade shapes", () => {
  const value = {
    kind: "training",
    target: 3,
    discipline: null,
    grade: null,
    timeframe: "month",
    endDate: "2026-09-30",
    repeat: "none",
    timezone: "UTC",
  };
  expect(goalInputSchema.safeParse(value).success).toBe(true);
  for (const patch of [
    { endDate: "2026-02-30" },
    { timezone: "Not/AZone" },
    { target: 0 },
    { target: 1.5 },
    { kind: "grade", grade: null },
    { kind: "training", repeat: "year" },
  ])
    expect(goalInputSchema.safeParse({ ...value, ...patch }).success).toBe(false);
});

it("restricts minimum-grade matching to volume goals with a selected grade", () => {
  const value = {
    kind: "volume",
    target: 8,
    discipline: "boulder",
    grade: 5,
    gradeMatch: "at-least",
    timeframe: "year",
    endDate: "2026-12-31",
    repeat: "none",
    timezone: "UTC",
  };
  expect(goalInputSchema.safeParse(value).success).toBe(true);
  expect(goalInputSchema.safeParse({ ...value, grade: null }).success).toBe(false);
  expect(goalInputSchema.safeParse({ ...value, kind: "grade", target: 1 }).success).toBe(false);
  expect(goalInputSchema.parse({ ...value, gradeMatch: undefined }).gradeMatch).toBe("exact");
});

it("allows recurring volume and exploration while keeping milestones and training years one-time", () => {
  const base = {
    target: 3,
    discipline: null,
    grade: null,
    timeframe: "month",
    repeat: "month",
    endDate: "2026-09-30",
    timezone: "UTC",
  };
  for (const kind of ["days", "new-areas"]) {
    for (const repeat of ["week", "month", "year"])
      expect(goalInputSchema.safeParse({ ...base, kind, repeat }).success).toBe(true);
  }
  expect(
    goalInputSchema.safeParse({
      ...base,
      kind: "volume",
      discipline: "boulder",
      grade: 6,
      repeat: "year",
    }).success,
  ).toBe(true);
  expect(
    goalInputSchema.safeParse({
      ...base,
      kind: "grade",
      target: 1,
      discipline: "boulder",
      grade: 6,
    }).success,
  ).toBe(false);
  expect(goalInputSchema.safeParse({ ...base, kind: "training", repeat: "year" }).success).toBe(
    false,
  );
  expect(
    goalInputSchema.safeParse({ ...base, kind: "training", repeat: "none", timeframe: "year" })
      .success,
  ).toBe(false);
});

it("clamps the missed-goal decision month at short months and leap years", async () => {
  const { missedGoalArchiveDate } = await import("./goals");
  expect(missedGoalArchiveDate("2026-01-30")).toBe("2026-02-28");
  expect(missedGoalArchiveDate("2028-01-30")).toBe("2028-02-29");
  expect(missedGoalArchiveDate("2026-12-14")).toBe("2027-01-15");
});

it("normalizes goal hashtag filters and rejects invalid or excessive hashtags", () => {
  const input = {
    kind: "training",
    target: 1,
    discipline: null,
    grade: null,
    timeframe: "month",
    repeat: "none",
    endDate: "2026-09-30",
    timezone: "UTC",
  };
  expect(
    goalInputSchema.parse({ ...input, tags: [" #Strength ", "HANGBOARD", "strength"] }).tags,
  ).toEqual(["hangboard", "strength"]);
  for (const tags of [
    ["bad tag"],
    ["x".repeat(25)],
    Array.from({ length: 9 }, (_, i) => `tag-${i}`),
  ])
    expect(goalInputSchema.safeParse({ ...input, tags }).success).toBe(false);
});
