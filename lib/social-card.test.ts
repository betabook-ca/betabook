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
  it("scopes to the dominant discipline within the period, narrowing every stat to it", () => {
    const sends = [
      send({ climbType: "boulder", suggestedGrade: 5, dateSent: "2026-09-01" }), // V4, this month
      send({ climbType: "boulder", suggestedGrade: 8, dateSent: "2026-09-05" }), // V7, this month
      send({ climbType: "sport", suggestedGrade: 20, dateSent: "2026-01-01" }), // this year only
      send({ climbType: "trad", suggestedGrade: 6, dateSent: "2025-12-01" }), // last year
    ];

    const month = buildSocialCardStats(sends, undefined, "month", TODAY);
    expect(month.scope).toBe("boulder");
    expect(month.sendCount).toBe(2);
    expect(month.hardest).toEqual({ label: "V7", climbName: "Some Climb" });

    // Boulder still leads by volume (2 vs 1 sport) once the year widens the
    // window, so the sport send in January narrows back out of every stat —
    // the same way choosing a discipline on the analytics page does.
    const year = buildSocialCardStats(sends, undefined, "year", TODAY);
    expect(year.scope).toBe("boulder");
    expect(year.sendCount).toBe(2);

    const all = buildSocialCardStats(sends, undefined, "all", TODAY);
    expect(all.scope).toBe("boulder");
    expect(all.sendCount).toBe(2);
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
      scope: null,
      sendCount: 0,
      daysOut: 0,
      hardest: null,
      areaCount: 0,
      topArea: null,
      flashPct: null,
      longestStreak: null,
    });
  });

  it("breaks a volume tie boulder → sport → trad", () => {
    const sends = [
      send({ climbType: "trad", dateSent: "2026-09-01" }),
      send({ climbType: "sport", dateSent: "2026-09-02" }),
      send({ climbType: "boulder", dateSent: "2026-09-03" }),
    ];

    expect(buildSocialCardStats(sends, undefined, "month", TODAY).scope).toBe("boulder");
  });

  it("prefers journal session volume over raw send counts, like the analytics page", () => {
    const sends = [send({ climbType: "boulder", dateSent: "2026-09-01" })];
    const sessions: AnalyticsJournalSession[] = [
      { entryDate: "2026-09-02", climbType: "sport", count: 5 },
      { entryDate: "2026-09-03", climbType: "sport", count: 5 },
    ];

    const stats = buildSocialCardStats(sends, sessions, "month", TODAY);

    expect(stats.scope).toBe("sport");
    // Days out follows the sessions too, including the day with no send.
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
