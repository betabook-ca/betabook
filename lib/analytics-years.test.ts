import { describe, expect, it } from "vitest";

import { formatAnalyticsYears, parseAnalyticsYears } from "./analytics-years";

describe("analytics year selection", () => {
  it("normalizes comma-separated and repeated URL values to available years", () => {
    expect(
      parseAnalyticsYears(["2023,2020", "2023", "oops", "2021.0", "2030"], [2020, 2021, 2023]),
    ).toEqual([2020, 2023]);
    expect(parseAnalyticsYears("2021", [2020, 2021])).toEqual([2021]);
    expect(parseAnalyticsYears(undefined, [2020])).toEqual([]);
    expect(parseAnalyticsYears("bad", [2020])).toEqual([]);
  });
  it("labels adjacent ranges and nonconsecutive selections without implying extra years", () => {
    expect(formatAnalyticsYears([])).toBe("All time");
    expect(formatAnalyticsYears([2020])).toBe("2020");
    expect(formatAnalyticsYears([2023, 2020, 2021, 2022])).toBe("2020–2023");
    expect(formatAnalyticsYears([2020, 2022, 2023, 2025])).toBe("2020, 2022–2023, 2025");
  });
});
