import { expect, it } from "vitest";

import { goalTitle, goalToday, goalWindow, type GoalTitleInput } from "./goals";

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

it("clamps the missed-goal decision month at short months and leap years", async () => {
  const { missedGoalArchiveDate } = await import("./goals");
  expect(missedGoalArchiveDate("2026-01-30")).toBe("2026-02-28");
  expect(missedGoalArchiveDate("2028-01-30")).toBe("2028-02-29");
  expect(missedGoalArchiveDate("2026-12-14")).toBe("2027-01-15");
});

it("keeps civil dates current across midnight when reusing a timezone formatter", () => {
  expect(goalToday("Pacific/Kiritimati", new Date("2026-08-31T09:59:00Z"))).toBe("2026-08-31");
  expect(goalToday("Pacific/Kiritimati", new Date("2026-08-31T10:00:00Z"))).toBe("2026-09-01");
  expect(goalToday("America/Vancouver", new Date("2026-08-31T10:00:00Z"))).toBe("2026-08-31");
});

it("titles a goal with its grade in the reader's grading systems", () => {
  const milestone: GoalTitleInput = {
    kind: "grade",
    target: 1,
    discipline: "boulder",
    grade: 5,
    repeat: "none",
    gradeMatch: "exact",
    tags: [],
  };
  expect(goalTitle(milestone)).toBe("Send my first V4");
  expect(goalTitle(milestone, { boulder: "font", rope: "yds" })).toBe("Send my first 6B");
  const volume: GoalTitleInput = {
    kind: "volume",
    target: 5,
    discipline: "sport",
    grade: 4,
    repeat: "month",
    gradeMatch: "at-least",
    tags: ["summer"],
  };
  expect(goalTitle(volume)).toBe("Send 5 climbs at 5.4 or harder every month · #summer");
  expect(goalTitle(volume, { boulder: "hueco", rope: "french" })).toBe(
    "Send 5 climbs at 3 or harder every month · #summer",
  );
});
