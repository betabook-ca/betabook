import { expect, it } from "vitest";

import { goalWeekSlots } from "./goal-week-slots";
it("uses the actual Mondays in each month, including five-week and leap-year months", () => {
  expect(goalWeekSlots("2026-09").map((p) => p.periodStart)).toEqual([
    "2026-09-07",
    "2026-09-14",
    "2026-09-21",
    "2026-09-28",
  ]);
  expect(goalWeekSlots("2026-08")).toHaveLength(5);
  expect(goalWeekSlots("2028-02")).toHaveLength(4);
  expect(goalWeekSlots("2026-09")[3].periodEnd).toBe("2026-10-04");
});
