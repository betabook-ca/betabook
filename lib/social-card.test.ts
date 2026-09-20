import { describe, expect, it } from "vitest";

import type { AnalyticsSendRow } from "@/db/queries";
import type { AnalyticsJournalSession } from "@/lib/user-analytics";

import {
  buildSocialCardStats,
  isSocialCardPeriod,
  socialCardPeriodLabel,
  SOCIAL_CARD_PERIODS,
} from "./social-card";

const TODAY = "2026-09-15";

let nextClimbId = 1;
function send(over: Partial<AnalyticsSendRow>): AnalyticsSendRow {
  const climbId = nextClimbId;
  nextClimbId += 1;
  return {
    climbId,
    climbName: "Some Climb",
    climbType: "boulder",
    suggestedGrade: 3,
    areaId: 1,
    areaName: "Forestland",
    ascentStyle: "redpoint",
    dateSent: "2024-03-10",
    ...over,
  };
}

describe("isSocialCardPeriod", () => {
  it("accepts only the three period ids", () => {
    for (const { id } of SOCIAL_CARD_PERIODS) expect(isSocialCardPeriod(id)).toBe(true);
    expect(isSocialCardPeriod("week")).toBe(false);
    expect(isSocialCardPeriod(undefined)).toBe(false);
  });
});

describe("socialCardPeriodLabel", () => {
  it("names the period against today's date", () => {
    expect(socialCardPeriodLabel("all", TODAY)).toBe("All time");
    expect(socialCardPeriodLabel("year", TODAY)).toBe("2026");
    expect(socialCardPeriodLabel("month", TODAY)).toBe("Sep 2026");
  });
});

describe("buildSocialCardStats", () => {
  it("combines every discipline's sends within the period instead of scoping to one", () => {
    const sends = [
      send({ climbType: "boulder", suggestedGrade: 8, dateSent: "2026-09-05" }), // V7, this month
      send({ climbType: "sport", suggestedGrade: 20, dateSent: "2026-01-01" }), // this year only
      send({ climbType: "trad", suggestedGrade: 6, dateSent: "2025-12-01" }), // last year
    ];

    const month = buildSocialCardStats(sends, undefined, "month", TODAY);
    expect(month.sendCount).toBe(1);
    expect(month.pyramid).toEqual([
      { type: "boulder", rows: [{ grade: 8, label: "V7", count: 1 }] },
    ]);

    const year = buildSocialCardStats(sends, undefined, "year", TODAY);
    expect(year.sendCount).toBe(2);
    expect(year.pyramid.map((p) => p.type)).toEqual(["boulder", "sport"]);

    const all = buildSocialCardStats(sends, undefined, "all", TODAY);
    expect(all.sendCount).toBe(3);
    // One pyramid per discipline present, boulder → sport → trad.
    expect(all.pyramid.map((p) => p.type)).toEqual(["boulder", "sport", "trad"]);
  });

  it("caps each discipline's pyramid to its hardest few rungs", () => {
    const sends = [3, 4, 5, 6, 7, 8].map((suggestedGrade) =>
      send({ suggestedGrade, dateSent: "2026-09-01" }),
    );

    const stats = buildSocialCardStats(sends, undefined, "month", TODAY);

    expect(stats.pyramid).toHaveLength(1);
    // Six rungs climbed, but only the hardest five make the card.
    expect(stats.pyramid[0].rows.map((row) => row.grade)).toEqual([8, 7, 6, 5, 4]);
  });

  it("includes undated sends in all time but excludes them from month/year", () => {
    const sends = [send({ dateSent: null })];

    expect(buildSocialCardStats(sends, undefined, "all", TODAY).sendCount).toBe(1);
    expect(buildSocialCardStats(sends, undefined, "year", TODAY).sendCount).toBe(0);
    expect(buildSocialCardStats(sends, undefined, "month", TODAY).sendCount).toBe(0);
  });

  it("is empty with no activity in the period, but still labeled", () => {
    const sends = [send({ dateSent: "2026-01-01" })]; // outside September

    const stats = buildSocialCardStats(sends, undefined, "month", TODAY);

    expect(stats).toEqual({
      period: "month",
      periodLabel: "Sep 2026",
      sendCount: 0,
      daysOut: 0,
      pyramid: [],
      areaCount: 0,
      topArea: null,
      flashPct: null,
      longestStreak: null,
    });
  });

  it("counts days out from journal sessions across every discipline, not just one", () => {
    const sends = [send({ climbType: "boulder", dateSent: "2026-09-01" })];
    const sessions: AnalyticsJournalSession[] = [
      { entryDate: "2026-09-02", climbType: "sport", count: 5 },
      { entryDate: "2026-09-03", climbType: "trad", count: 5 },
    ];

    const stats = buildSocialCardStats(sends, sessions, "month", TODAY);

    // Once journal sessions exist for the period, days out comes from them —
    // both the sport and trad session days count, not just one discipline's.
    expect(stats.daysOut).toBe(2);
  });

  it("reports the flash rate and longest streak within the period", () => {
    const sends = [
      send({ dateSent: "2026-09-01", ascentStyle: "redpoint" }),
      send({ dateSent: "2026-09-02", ascentStyle: "flash" }),
      send({ dateSent: "2026-09-03", ascentStyle: "flash" }),
    ];

    const stats = buildSocialCardStats(sends, undefined, "month", TODAY);

    expect(stats.flashPct).toBe(67); // 2 of 3, rounded
    expect(stats.longestStreak).toBe(3); // three consecutive days
  });
});
