import { describe, expect, it } from "vitest";

import type { RecapSendRow } from "@/db/queries";
import type { HighlightSession } from "@/lib/analytics-highlights";
import type { AnalyticsJournalSession } from "@/lib/user-analytics";

import {
  buildSocialCardStats,
  isSocialCardPeriod,
  isYearInReviewMonth,
  socialCardCoverHighlights,
  socialCardPeriodLabel,
} from "./social-card";

const TODAY = "2026-09-15";

let nextClimbId = 1;
function send(over: Partial<RecapSendRow>): RecapSendRow {
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
    rating: null,
    ...over,
  };
}

describe("isSocialCardPeriod", () => {
  it("accepts only the three period ids", () => {
    for (const id of ["month", "year", "all"]) expect(isSocialCardPeriod(id)).toBe(true);
    expect(isSocialCardPeriod("week")).toBe(false);
    expect(isSocialCardPeriod(undefined)).toBe(false);
  });
});

describe("isYearInReviewMonth", () => {
  it("opens only for well-formed December dates", () => {
    expect(isYearInReviewMonth("2026-12-01")).toBe(true);
    expect(isYearInReviewMonth("2026-12-31")).toBe(true);
    expect(isYearInReviewMonth("2026-11-30")).toBe(false);
    expect(isYearInReviewMonth("December")).toBe(false);
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
      send({
        climbType: "boulder",
        climbName: "Greedy Creator",
        suggestedGrade: 8,
        dateSent: "2026-09-05",
      }),
      send({
        climbType: "boulder",
        climbName: "Warmup",
        suggestedGrade: 4,
        dateSent: "2026-09-10",
      }),
      send({
        climbType: "sport",
        climbName: "Skyline",
        suggestedGrade: 20,
        dateSent: "2026-01-01",
      }),
      send({
        climbType: "trad",
        climbName: "North Ridge",
        suggestedGrade: 6,
        dateSent: "2025-12-01",
      }),
    ];

    const month = buildSocialCardStats(sends, undefined, "month", TODAY);
    expect(month.sendCount).toBe(2);
    expect(month.disciplines).toMatchObject([
      { type: "boulder", sendCount: 2, hardest: { grade: "V7", climbName: "Greedy Creator" } },
    ]);
    expect(month.calendar.counts["2026-09-05"]).toBe(1);
    expect(month.calendar.counts["2026-01-01"]).toBe(1); // full year remains visible

    const year = buildSocialCardStats(sends, undefined, "year", TODAY);
    expect(year.sendCount).toBe(3);
    expect(year.disciplines).toMatchObject([
      { type: "boulder", sendCount: 2, hardest: { grade: "V7", climbName: "Greedy Creator" } },
      { type: "sport", sendCount: 1, hardest: { grade: "5.12c", climbName: "Skyline" } },
    ]);
    expect(year.calendar).toMatchObject({ year: 2026, highlightMonth: null });

    const all = buildSocialCardStats(sends, undefined, "all", TODAY);
    expect(all.sendCount).toBe(4);
    expect(all.disciplines).toMatchObject([
      { type: "boulder", sendCount: 2, hardest: { grade: "V7", climbName: "Greedy Creator" } },
      { type: "sport", sendCount: 1, hardest: { grade: "5.12c", climbName: "Skyline" } },
      { type: "trad", sendCount: 1, hardest: { grade: "5.6", climbName: "North Ridge" } },
    ]);
    expect(all.calendar.year).toBe(2026);
  });

  it("includes undated sends in all time but excludes them from month/year", () => {
    const sends = [send({ dateSent: null })];

    expect(buildSocialCardStats(sends, undefined, "all", TODAY)).toMatchObject({
      sendCount: 1,
      disciplines: [{ type: "boulder", sendCount: 1, hardest: { grade: "V2" } }],
    });
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
      disciplines: [],
      breakthroughs: [],
      highlights: [],
      favoriteClimbs: [],
      calendar: {
        year: 2026,
        throughDate: TODAY,
        highlightMonth: 9,
        label: "SEP 2026 IN FOCUS",
        counts: { "2026-01-01": 1 },
      },
      longestStreak: null,
      firstTryPct: null,
      busiestMonth: null,
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

  it("fills the remaining single-discipline cover card with flash rate", () => {
    const sends = [
      send({ ascentStyle: "flash", dateSent: "2026-08-01" }),
      send({ ascentStyle: "flash", dateSent: "2026-09-01" }),
      send({ ascentStyle: "redpoint", dateSent: "2026-09-02" }),
    ];
    const stats = buildSocialCardStats(sends, undefined, "year", TODAY);

    expect(stats.firstTryPct).toBe(67);
    expect(stats.busiestMonth).toEqual({ month: "2026-09", count: 2 });
    expect(socialCardCoverHighlights(stats)).toEqual([
      { id: "firstTry", label: "Flash rate", value: "67%", detail: "of boulder sends" },
    ]);
  });

  it("keeps send counts when a discipline has no valid graded send", () => {
    const sends = [
      send({ climbType: "boulder", suggestedGrade: 0, dateSent: "2026-09-01" }),
      send({ climbType: "sport", suggestedGrade: null, dateSent: "2026-09-02" }),
      send({ climbType: "trad", suggestedGrade: 999, dateSent: "2026-09-03" }),
    ];

    expect(buildSocialCardStats(sends, undefined, "month", TODAY).disciplines).toMatchObject([
      { type: "boulder", sendCount: 1, hardest: { grade: "VB", climbName: "Some Climb" } },
      { type: "sport", sendCount: 1, hardest: null },
      { type: "trad", sendCount: 1, hardest: null },
    ]);
  });

  it("freezes the climber's top rated sends per discipline and across the recap", () => {
    const sends = [
      send({ climbName: "Easy favorite", suggestedGrade: 3, rating: 5, dateSent: "2026-09-01" }),
      send({ climbName: "Hard favorite", suggestedGrade: 8, rating: 5, dateSent: "2026-09-02" }),
      send({ climbName: "Third favorite", suggestedGrade: 5, rating: 4, dateSent: "2026-09-03" }),
      send({ climbName: "Unrated", suggestedGrade: 4, rating: null, dateSent: "2026-09-04" }),
      send({ climbName: "Last year", suggestedGrade: 9, rating: 5, dateSent: "2025-09-01" }),
    ];

    const stats = buildSocialCardStats(sends, undefined, "year", TODAY);
    const [boulder] = stats.disciplines;
    expect(boulder.sendCount).toBe(4);
    expect(
      boulder.favorites.map(({ climbName, rating, grade }) => ({ climbName, rating, grade })),
    ).toEqual([
      { climbName: "Hard favorite", rating: 5, grade: "V7" },
      { climbName: "Easy favorite", rating: 5, grade: "V2" },
      { climbName: "Third favorite", rating: 4, grade: "V4" },
    ]);
    expect(stats.favoriteClimbs?.map(({ climbName }) => climbName)).toEqual([
      "Hard favorite",
      "Easy favorite",
      "Third favorite",
    ]);
  });

  it("shows each rated climb once even when it has multiple sends", () => {
    const first = send({ climbName: "Repeat", rating: 4, dateSent: "2026-09-01" });
    const sends = [
      first,
      send({ climbId: first.climbId, climbName: "Repeat", rating: 5, dateSent: "2026-09-02" }),
      send({ climbName: "Second", rating: 4, dateSent: "2026-09-03" }),
      send({ climbName: "Third", rating: 3, dateSent: "2026-09-04" }),
    ];

    expect(
      buildSocialCardStats(sends, undefined, "month", TODAY).disciplines[0].favorites.map(
        ({ climbName, rating }) => ({ climbName, rating }),
      ),
    ).toEqual([
      { climbName: "Repeat", rating: 5 },
      { climbName: "Second", rating: 4 },
      { climbName: "Third", rating: 3 },
    ]);
  });

  it("adds partner, project, and busiest-session-day Analytics highlights", () => {
    const sends = [send({ dateSent: "2026-09-02" })];
    const session = (
      id: number,
      entryDate: string,
      props: Partial<HighlightSession> = {},
    ): HighlightSession => ({
      id,
      entryDate,
      climbId: 1,
      climbName: "Long Project",
      climbType: "boulder",
      sent: false,
      isAscent: false,
      companions: [{ id: "sam", name: "Sam Chen" }],
      ...props,
    });
    const highlightSessions = [
      session(1, "2026-09-01"),
      session(2, "2026-09-01"),
      session(3, "2026-09-02", { climbId: 2, climbName: "Other Climb" }),
    ];

    expect(
      buildSocialCardStats(sends, undefined, "month", TODAY, highlightSessions).highlights,
    ).toMatchObject([
      { id: "partner", value: "Sam Chen", detail: "2 shared days" },
      { id: "mostSessioned", value: "Long Project", detail: "2 sessions" },
      { id: "busiestDay", value: "2 sessions", detail: "Sep 1, 2026" },
    ]);
  });

  it("highlights only new lifetime grades reached during the selected period", () => {
    const sends = [
      send({ climbName: "Baseline", suggestedGrade: 5, dateSent: "2025-09-01" }),
      send({ climbName: "Below baseline", suggestedGrade: 4, dateSent: "2026-09-01" }),
      send({ climbName: "First new grade", suggestedGrade: 6, dateSent: "2026-09-02" }),
      send({ climbName: "Repeat", suggestedGrade: 6, dateSent: "2026-09-03" }),
      send({ climbName: "Latest breakthrough", suggestedGrade: 7, dateSent: "2026-09-04" }),
    ];

    const month = buildSocialCardStats(sends, undefined, "month", TODAY);
    expect(month.disciplines[0].hardest).toMatchObject({ grade: "V6" });
    expect(month.breakthroughs).toEqual([
      {
        type: "boulder",
        grade: "V6",
        climbName: "Latest breakthrough",
        dateSent: "2026-09-04",
      },
      {
        type: "boulder",
        grade: "V5",
        climbName: "First new grade",
        dateSent: "2026-09-02",
      },
    ]);
    expect(
      buildSocialCardStats(sends.slice(0, 2), undefined, "month", TODAY).breakthroughs,
    ).toEqual([]);
    expect(buildSocialCardStats([sends[2]], undefined, "month", TODAY).breakthroughs).toEqual([]);
  });

  it("gathers breakthrough climbs from every discipline onto one dated list", () => {
    const sends = [
      send({ climbType: "boulder", suggestedGrade: 3, dateSent: "2025-01-01" }),
      send({ climbType: "sport", suggestedGrade: 10, dateSent: "2025-01-02" }),
      send({
        climbType: "sport",
        climbName: "New rope grade",
        suggestedGrade: 12,
        dateSent: "2026-09-02",
      }),
      send({
        climbType: "boulder",
        climbName: "New boulder grade",
        suggestedGrade: 4,
        dateSent: "2026-09-03",
      }),
    ];

    expect(buildSocialCardStats(sends, undefined, "month", TODAY).breakthroughs).toEqual([
      {
        type: "boulder",
        grade: "V3",
        climbName: "New boulder grade",
        dateSent: "2026-09-03",
      },
      {
        type: "sport",
        grade: "5.10c",
        climbName: "New rope grade",
        dateSent: "2026-09-02",
      },
    ]);
  });

  it("keeps days out even when the period has only project sessions", () => {
    const sessions: AnalyticsJournalSession[] = [
      { entryDate: "2026-09-02", climbType: "sport", count: 1 },
      { entryDate: "2026-09-03", climbType: "trad", count: 1 },
    ];

    const stats = buildSocialCardStats([], sessions, "month", TODAY);

    expect(stats).toMatchObject({ sendCount: 0, daysOut: 2 });
    expect(stats.calendar.counts).toEqual({ "2026-09-02": 1, "2026-09-03": 1 });
  });

  it("reports the longest streak within the period", () => {
    const sends = [
      send({ dateSent: "2026-09-01", ascentStyle: "redpoint" }),
      send({ dateSent: "2026-09-02", ascentStyle: "flash" }),
      send({ dateSent: "2026-09-03", ascentStyle: "flash" }),
    ];

    const stats = buildSocialCardStats(sends, undefined, "month", TODAY);

    expect(stats.longestStreak).toBe(3); // three consecutive days
  });

  it("shows a calendar of climbing days and picks the busiest year for all time", () => {
    const sessions: AnalyticsJournalSession[] = [
      { entryDate: "2025-03-01", climbType: "boulder", count: 1 },
      { entryDate: "2025-03-02", climbType: "boulder", count: 1 },
      { entryDate: "2025-03-03", climbType: "boulder", count: 1 },
      { entryDate: "2026-09-01", climbType: "sport", count: 9 },
      { entryDate: "2026-09-02", climbType: "sport", count: 1 },
    ];

    const month = buildSocialCardStats([], sessions, "month", TODAY);
    expect(month.calendar).toMatchObject({ year: 2026, highlightMonth: 9 });
    expect(month.calendar.counts["2026-09-01"]).toBe(9);

    const all = buildSocialCardStats([], sessions, "all", TODAY);
    expect(all.calendar).toMatchObject({ year: 2025, highlightMonth: null });
    expect(all.calendar.counts["2025-03-02"]).toBe(1);
  });
});
