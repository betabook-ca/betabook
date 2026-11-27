import { expect, it } from "vitest";

import { goalDateLabel } from "./goal-date-label";

it("uses month names and omits only the current year", () => {
  const goal = {
    repeat: "none",
    timeframe: "month",
    periodStart: "2026-09-07",
    periodEnd: "2026-09-30",
  };
  expect(goalDateLabel(goal, "2026-09-12")).toBe("By Sep 30");
  expect(goalDateLabel({ ...goal, repeat: "week" }, "2026-09-12")).toBe("Week of Sep 7");
  expect(goalDateLabel({ ...goal, repeat: "month" }, "2026-09-12")).toBe("September");
  expect(goalDateLabel({ ...goal, repeat: "month" }, "2027-01-01")).toBe("September 2026");
  expect(goalDateLabel({ ...goal, completedDate: "2026-09-11" }, "2026-09-12")).toBe("Sep 11");
});
it("shows custom ranges and both years for a season spanning years", () => {
  const goal = {
    repeat: "none",
    timeframe: "custom",
    periodStart: "2026-06-01",
    periodEnd: "2026-11-30",
  };
  expect(goalDateLabel(goal, "2026-09-12")).toBe("Jun 1 – Nov 30");
  expect(
    goalDateLabel({ ...goal, periodStart: "2026-12-01", periodEnd: "2027-02-28" }, "2026-09-12"),
  ).toBe("Dec 1, 2026 – Feb 28, 2027");
  expect(goalDateLabel({ ...goal, completedDate: "2026-09-12" }, "2026-09-12")).toBe(
    "Jun 1 – Nov 30",
  );
});

it("shows the next monthly reset across a year boundary", async () => {
  const { recurringGoalResetLabel } = await import("./goal-date-label");
  expect(
    recurringGoalResetLabel(
      { repeat: "month", timeframe: "month", periodStart: "2026-12-01", periodEnd: "2026-12-31" },
      "2026-12-15",
    ),
  ).toBe("Resets Jan 1, 2027");
});

it("uses the next period start rather than the date the recurring target was met", async () => {
  const { recurringGoalResetLabel } = await import("./goal-date-label");
  const goal = {
    repeat: "month",
    timeframe: "month",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    completedDate: "2026-09-11",
  };
  expect(recurringGoalResetLabel(goal, "2026-09-12")).toBe("Resets Oct 1");
});
