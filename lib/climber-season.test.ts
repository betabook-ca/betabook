import { describe, expect, it } from "vitest";

import { buildSeason, seasonRange } from "@/lib/climber-season";

const total = (season: ReturnType<typeof buildSeason>) =>
  season.reduce((sum, week) => sum + week.days, 0);

describe("buildSeason", () => {
  it("ends with the Monday-start week holding today", () => {
    const season = buildSeason([], "2026-03-08");

    expect(season).toHaveLength(52);
    expect(season.at(-1)).toEqual({ start: "2026-03-02", days: 0 });
    expect(season[0]).toEqual({ start: "2025-03-10", days: 0 });
  });

  it("counts each active day once in its own week", () => {
    const season = buildSeason(
      ["2026-03-02", "2026-03-02", "2026-03-08", "2026-02-23"],
      "2026-03-08",
    );

    expect(season.at(-1)).toEqual({ start: "2026-03-02", days: 2 });
    expect(season.at(-2)).toEqual({ start: "2026-02-23", days: 1 });
    expect(total(season)).toBe(3);
  });

  it("ignores days before the first week and after today", () => {
    const season = buildSeason(["2025-03-09", "2025-03-10", "2026-03-09"], "2026-03-08");

    expect(season[0].days).toBe(1);
    expect(total(season)).toBe(1);
  });
});

describe("seasonRange", () => {
  it("runs from the first week's Monday through today", () => {
    expect(seasonRange("2026-03-04")).toEqual({ from: "2025-03-10", to: "2026-03-04" });
  });
});
