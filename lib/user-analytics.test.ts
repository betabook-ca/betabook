import { describe, expect, it } from "vitest";

import type { AnalyticsSendRow } from "@/db/queries";

import {
  buildPyramid,
  buildUserAnalytics,
  formatDaySpan,
  getAnalyticsHistorySummary,
  inDateWindow,
  parseDisciplineScope,
  resolveDisciplineScope,
} from "./user-analytics";

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

describe("getAnalyticsHistorySummary", () => {
  it("keeps years from other disciplines and session-only years while scoping undated sends", () => {
    const rows = [
      send({ dateSent: "2024-03-10" }),
      send({ dateSent: "2022-06-01", climbType: "sport" }),
      send({ dateSent: null }),
      send({ dateSent: null, climbType: "sport" }),
    ];
    expect(
      getAnalyticsHistorySummary(rows, "boulder", [
        { entryDate: "2025-01-01", climbType: "sport", count: 3 },
        { entryDate: "2023-01-01", climbType: null },
        { entryDate: "2024-03-10", climbType: "boulder" },
      ]),
    ).toEqual({ years: [2025, 2024, 2023, 2022], undatedCount: 1 });
    expect(getAnalyticsHistorySummary(rows, "all")).toEqual({
      years: [2024, 2022],
      undatedCount: 2,
    });
    expect(getAnalyticsHistorySummary([], "trad", [])).toEqual({ years: [], undatedCount: 0 });
  });
});

describe("parseDisciplineScope", () => {
  it("accepts the three disciplines and falls back to all", () => {
    expect(parseDisciplineScope("sport")).toBe("sport");
    expect(parseDisciplineScope("alpine")).toBe("all");
    expect(parseDisciplineScope(undefined)).toBe("all");
  });
});

describe("resolveDisciplineScope", () => {
  const rows = [
    send({ climbType: "sport" }),
    send({ climbType: "boulder" }),
    send({ climbType: "sport" }),
  ];

  it("honors a requested discipline the climber has logged, in DISCIPLINE_ORDER", () => {
    expect(resolveDisciplineScope({ rows, sessions: [], requested: "boulder" })).toEqual({
      present: ["boulder", "sport"],
      scope: "boulder",
    });
  });

  it("ranks the default by session volume, not by the days a discipline appeared on", () => {
    const sessions = [
      { entryDate: "2026-03-10", climbType: "boulder" as const, count: 1 },
      { entryDate: "2026-03-11", climbType: "boulder" as const, count: 1 },
      { entryDate: "2026-03-12", climbType: "sport" as const, count: 5 },
    ];
    expect(resolveDisciplineScope({ rows: [], sessions, requested: "all" })).toEqual({
      present: ["boulder", "sport"],
      scope: "sport",
    });
    expect(resolveDisciplineScope({ rows: [], sessions, requested: "trad" }).scope).toBe("sport");
  });

  it("counts sends instead when the journal is not readable", () => {
    expect(resolveDisciplineScope({ rows, requested: "all" })).toEqual({
      present: ["boulder", "sport"],
      scope: "sport",
    });
  });

  it("has no scope with nothing logged", () => {
    expect(resolveDisciplineScope({ rows: [], sessions: [], requested: "sport" })).toEqual({
      present: [],
      scope: null,
    });
  });
});

describe("formatDaySpan", () => {
  it("scales units with the gap", () => {
    expect(formatDaySpan(0)).toBe("same day");
    expect(formatDaySpan(12)).toBe("12d");
    expect(formatDaySpan(120)).toBe("4 mo");
    expect(formatDaySpan(800)).toBe("2.2 yr");
  });
});

describe("buildPyramid", () => {
  it("builds from any slice, ignoring other disciplines and ungraded sends", () => {
    const rows = buildPyramid(
      [
        send({ suggestedGrade: 3 }),
        send({ suggestedGrade: 3 }),
        send({ suggestedGrade: 4 }),
        send({ climbType: "sport", suggestedGrade: 10 }),
        send({ suggestedGrade: null }),
      ],
      "boulder",
    );
    expect(rows).toEqual([
      { grade: 4, label: "V3", count: 1 },
      { grade: 3, label: "V2", count: 2 },
    ]);
  });

  it("returns no rows for an empty slice", () => {
    expect(buildPyramid([], "sport")).toEqual([]);
  });
});

describe("buildUserAnalytics", () => {
  it("handles an empty log", () => {
    const a = buildUserAnalytics([], "all");
    expect(a.sendCount).toBe(0);
    expect(a.dateSpan).toBeNull();
    expect(a.progression).toEqual([]);
    expect(a.breakthroughs).toEqual([]);
    expect(a.longestStreak).toBeNull();
  });

  it("filters everything to the selected discipline", () => {
    const a = buildUserAnalytics(
      [
        send({ climbType: "boulder", dateSent: "2024-01-01" }),
        send({ climbType: "sport", suggestedGrade: 10, dateSent: "2024-02-01" }),
      ],
      "sport",
    );
    expect(a.sendCount).toBe(1);
    expect(a.disciplines).toEqual(["sport"]);
    expect(a.dateSpan).toEqual(["2024-02-01", "2024-02-01"]);
  });

  it("keeps per-discipline groupings under the all scope", () => {
    const a = buildUserAnalytics(
      [
        send({ climbType: "sport", suggestedGrade: 10, dateSent: "2024-01-05" }),
        send({ climbType: "boulder", suggestedGrade: 4, dateSent: "2024-01-06" }),
      ],
      "all",
    );
    expect(a.disciplines).toEqual(["boulder", "sport"]);
    expect(a.hardest.map((h) => [h.type, h.label])).toEqual([
      ["boulder", "V3"],
      ["sport", "5.10a"],
    ]);
    expect(a.hardestFirstTry).toBeNull();
  });

  it("tracks personal best as a running max over month-hardest points", () => {
    const a = buildUserAnalytics(
      [
        send({ suggestedGrade: 3, dateSent: "2024-01-04" }),
        send({ suggestedGrade: 5, dateSent: "2024-01-20" }),
        send({ suggestedGrade: 4, dateSent: "2024-03-02" }),
      ],
      "boulder",
    );
    expect(a.progression).toEqual([
      {
        type: "boulder",
        points: [
          { month: "2024-01", hardest: 5, best: 5 },
          { month: "2024-03", hardest: 4, best: 5 },
        ],
      },
    ]);
  });

  it("builds the pyramid hardest-first with zero fills", () => {
    const a = buildUserAnalytics(
      [
        send({ suggestedGrade: 2, dateSent: null }),
        send({ suggestedGrade: 2 }),
        send({ suggestedGrade: 4 }),
      ],
      "boulder",
    );
    expect(a.pyramid).toEqual([
      {
        type: "boulder",
        rows: [
          { grade: 4, label: "V3", count: 1 },
          { grade: 3, label: "V2", count: 0 },
          { grade: 2, label: "V1", count: 2 },
        ],
      },
    ]);
    expect(a.datelessCount).toBe(1);
  });

  it("records breakthroughs with the wait since the previous ceiling-raise", () => {
    const a = buildUserAnalytics(
      [
        send({ suggestedGrade: 3, climbName: "First", dateSent: "2024-01-01" }),
        send({ suggestedGrade: 3, climbName: "Repeat", dateSent: "2024-02-01" }),
        send({ suggestedGrade: 6, climbName: "Jump", dateSent: "2024-03-01" }),
      ],
      "boulder",
    );
    expect(a.breakthroughs.map((b) => [b.climbName, b.label, b.waitDays])).toEqual([
      ["Jump", "V5", 60],
      ["First", "V2", null],
    ]);
  });

  it("lists two ceilings raised on the same day hardest first", () => {
    const a = buildUserAnalytics(
      [
        send({ suggestedGrade: 3, climbName: "Base", dateSent: "2024-01-01" }),
        // Logged in the harder-first order the chain must not inherit.
        send({ suggestedGrade: 6, climbName: "Second", dateSent: "2024-03-01" }),
        send({ suggestedGrade: 5, climbName: "First", dateSent: "2024-03-01" }),
      ],
      "boulder",
    );
    expect(a.breakthroughs.map((b) => [b.climbName, b.label, b.waitDays])).toEqual([
      ["Second", "V5", 0],
      ["First", "V4", 60],
      ["Base", "V2", null],
    ]);
  });

  it("keeps a send the climber never graded out of every grade chart", () => {
    const a = buildUserAnalytics(
      [
        send({ suggestedGrade: 7, climbName: "Graded", dateSent: "2024-01-01" }),
        send({ suggestedGrade: null, climbName: "Ungraded", dateSent: "2024-02-01" }),
      ],
      "boulder",
    );
    expect(a.sendCount).toBe(2);
    expect(a.hardest[0].label).toBe("V6");
    expect(a.pyramid[0].rows).toEqual([{ grade: 7, label: "V6", count: 1 }]);
    expect(a.progression[0].points).toEqual([{ month: "2024-01", hardest: 7, best: 7 }]);
    expect(a.breakthroughs.map((b) => [b.climbName, b.label])).toEqual([["Graded", "V6"]]);
  });

  it("computes streaks, layoffs, and calendar aggregates from dated days", () => {
    const a = buildUserAnalytics(
      [
        send({ dateSent: "2024-01-01" }), // Monday
        send({ dateSent: "2024-01-02" }),
        send({ dateSent: "2024-01-03" }),
        send({ dateSent: "2024-03-04" }), // Monday after a 61-day layoff
        send({ dateSent: "2024-03-04", climbId: 999 }),
      ],
      "all",
    );
    expect(a.daysOut).toBe(4);
    expect(a.longestStreak).toEqual({ days: 3, end: "2024-01-03" });
    expect(a.longestLayoff).toEqual({ days: 61, from: "2024-01-03", to: "2024-03-04" });
    expect(a.busiestMonth).toEqual({ month: "2024-01", count: 3 });
    expect(a.favoriteWeekday).toEqual({ weekday: "Monday", count: 3 });
    expect(a.bestYear).toEqual({ year: 2024, count: 5 });
    expect(a.years).toEqual([2024]);
    expect(a.calendarYears).toEqual([2024]);
    expect(a.calendarCounts["2024-03-04"]).toBe(2);
  });

  it("uses outdoor journal sessions for days out and consistency", () => {
    const a = buildUserAnalytics(
      [
        send({ climbType: "sport", dateSent: "2024-01-01" }),
        send({ climbType: "sport", dateSent: "2024-03-04" }),
      ],
      "sport",
      [
        { climbType: "sport", entryDate: "2024-01-01" },
        { climbType: "sport", entryDate: "2024-01-02" },
        { climbType: "sport", entryDate: "2024-01-02" },
        { climbType: "boulder", entryDate: "2024-02-01" },
        { climbType: "sport", entryDate: "2024-03-04" },
      ],
    );

    expect(a.daysOut).toBe(3);
    expect(a.longestStreak).toEqual({ days: 2, end: "2024-01-02" });
    expect(a.longestLayoff).toEqual({ days: 62, from: "2024-01-02", to: "2024-03-04" });
    expect(a.dateSpan).toEqual(["2024-01-01", "2024-03-04"]);
    expect(a.calendarYears).toEqual([2024]);
    expect(a.calendarCounts).toEqual({
      "2024-01-01": 1,
      "2024-01-02": 2,
      "2024-03-04": 1,
    });
  });

  it("reports no layoff when every gap is a back-to-back climbing day", () => {
    const a = buildUserAnalytics(
      [
        send({ dateSent: "2024-01-01" }),
        send({ dateSent: "2024-01-02" }),
        send({ dateSent: "2024-01-03" }),
      ],
      "all",
    );
    expect(a.longestStreak).toEqual({ days: 3, end: "2024-01-03" });
    expect(a.longestLayoff).toBeNull();
  });

  it("finds the top area and hardest flash within one discipline", () => {
    const a = buildUserAnalytics(
      [
        send({ areaId: 1, areaName: "Forestland" }),
        send({ areaId: 1, areaName: "Forestland" }),
        send({ areaId: 2, areaName: "Grand Wall", ascentStyle: "flash", suggestedGrade: 5 }),
      ],
      "boulder",
    );
    expect(a.areaCount).toBe(2);
    expect(a.topArea).toEqual({ id: 1, name: "Forestland", count: 2 });
    expect(a.flashCount).toBe(1);
    expect(a.firstTryCount).toBe(1);
    expect(a.hardestFirstTry?.label).toBe("V4");
  });

  it("counts rope onsights alongside flashes toward the flash rate", () => {
    const a = buildUserAnalytics(
      [
        send({ climbType: "sport", suggestedGrade: 10 }),
        send({ climbType: "sport", suggestedGrade: 11, ascentStyle: "flash" }),
        send({ climbType: "sport", suggestedGrade: 12, ascentStyle: "onsight" }),
      ],
      "sport",
    );
    expect(a.flashCount).toBe(1);
    expect(a.onsightCount).toBe(1);
    expect(a.firstTryCount).toBe(2);
    expect(a.hardestFirstTry?.grade).toBe(12);
  });
});

describe("analytics year scope", () => {
  const rows = [
    send({ climbId: 901, dateSent: "2023-12-31", suggestedGrade: 8 }),
    send({ climbId: 902, dateSent: "2024-01-01", suggestedGrade: 3 }),
    send({ climbId: 903, dateSent: "2024-12-31", suggestedGrade: 4, ascentStyle: "flash" }),
    send({ climbId: 904, dateSent: "2025-01-01", suggestedGrade: 6 }),
    send({ climbId: 905, dateSent: null, suggestedGrade: 9 }),
    send({ climbId: 906, climbType: "sport", dateSent: "2024-05-01" }),
  ];
  it("filters sends and visible sessions together, including both year boundaries", () => {
    const result = buildUserAnalytics(
      rows,
      "boulder",
      [
        { entryDate: "2023-12-31", climbType: "boulder" },
        { entryDate: "2024-06-01", climbType: "boulder", count: 3 },
        { entryDate: "2024-06-02", climbType: "sport" },
      ],
      [2024],
    );
    expect(result.sendCount).toBe(2);
    expect(result.hardest[0].climbId).toBe(903);
    expect(result.flashCount).toBe(1);
    expect(result.datelessCount).toBe(0);
    expect(result.pyramid[0].rows.map((row) => row.count)).toEqual([1, 1]);
    expect(result.calendarCounts).toEqual({ "2024-06-01": 3 });
    expect(result.daysOut).toBe(1);
    expect(result.dateSpan).toEqual(["2024-01-01", "2024-12-31"]);
  });
  it("keeps the send-only fallback and supports an empty year", () => {
    expect(buildUserAnalytics(rows, "boulder", undefined, [2024]).calendarCounts).toEqual({
      "2024-01-01": 1,
      "2024-12-31": 1,
    });
    const empty = buildUserAnalytics(rows, "boulder", undefined, [2022]);
    expect(empty.sendCount).toBe(0);
    expect(empty.pyramid).toEqual([]);
    expect(empty.calendarCounts).toEqual({});
  });
  it("retains undated sends and historical records in all time", () => {
    const lifetime = buildUserAnalytics(rows, "boulder", undefined, []);
    expect(lifetime.sendCount).toBe(5);
    expect(lifetime.datelessCount).toBe(1);
    expect(lifetime.breakthroughs.map((row) => row.climbId)).toEqual([901]);
    expect(lifetime.bestYear).toEqual({ year: 2024, count: 2 });
  });
});

describe("multiple analytics years", () => {
  it("rebuilds every chart and best year from only the selected years", () => {
    const rows = [
      send({ climbId: 1001, dateSent: "2019-12-31", suggestedGrade: 10 }),
      send({ climbId: 1002, dateSent: "2020-01-01", suggestedGrade: 3 }),
      send({ climbId: 1003, dateSent: "2021-01-01", suggestedGrade: 9 }),
      send({ climbId: 1004, dateSent: "2023-03-01", suggestedGrade: 4 }),
      send({ climbId: 1005, dateSent: "2023-12-31", suggestedGrade: 5 }),
      send({ climbId: 1006, dateSent: null, suggestedGrade: 11 }),
    ];
    const result = buildUserAnalytics(
      rows,
      "boulder",
      [
        { entryDate: "2020-01-01", climbType: "boulder" },
        { entryDate: "2021-01-01", climbType: "boulder" },
        { entryDate: "2023-12-31", climbType: "boulder", count: 2 },
      ],
      [2020, 2023],
    );
    expect(result.sendCount).toBe(3);
    expect(result.datelessCount).toBe(0);
    expect(result.hardest[0].climbId).toBe(1005);
    expect(result.bestYear).toEqual({ year: 2023, count: 2 });
    expect(result.progression[0].points).toEqual([
      { month: "2020-01", hardest: 3, best: 3 },
      { month: "2023-03", hardest: 4, best: 4 },
      { month: "2023-12", hardest: 5, best: 5 },
    ]);
    expect(result.breakthroughs.map((row) => row.climbId)).toEqual([1005, 1004, 1002]);
    expect(result.pyramid[0].rows.map((row) => row.grade)).toEqual([5, 4, 3]);
    expect(result.calendarCounts).toEqual({ "2020-01-01": 1, "2023-12-31": 2 });
    expect(result.daysOut).toBe(2);
    expect(result.years).toEqual([2020, 2023]);
  });
});

it("builds monthly volume and flash rates from the selected years and discipline", () => {
  // Rope rows carry the onsight: boulders are never onsights, and the
  // flash-rate numerator has to count both styles.
  const rows = [
    send({ dateSent: "2024-01-02", climbType: "sport", suggestedGrade: 10, ascentStyle: "flash" }),
    send({ dateSent: "2024-01-02", climbType: "sport", suggestedGrade: 10 }),
    send({
      dateSent: "2024-03-01",
      climbType: "sport",
      suggestedGrade: 10,
      ascentStyle: "onsight",
    }),
    send({ dateSent: null, climbType: "sport", suggestedGrade: 10, ascentStyle: "flash" }),
    send({ dateSent: "2023-01-01", climbType: "sport", suggestedGrade: 10, ascentStyle: "flash" }),
    send({ dateSent: "2024-01-02" }),
  ];
  const result = buildUserAnalytics(
    rows,
    "sport",
    [
      { entryDate: "2024-01-02", climbType: "sport", count: 4 },
      { entryDate: "2024-01-02", climbType: "sport" },
      { entryDate: "2024-03-12", climbType: "sport" },
      { entryDate: "2024-02-01", climbType: "boulder" },
    ],
    [2024],
  );
  expect(result.volume).toEqual([
    { month: "2024-01", sends: 2, days: 1 },
    { month: "2024-02", sends: 0, days: 0 },
    { month: "2024-03", sends: 1, days: 1 },
  ]);
  expect(result.firstTryByGrade[0].rows).toEqual([
    { grade: 10, label: "5.10a", sends: 3, firstTries: 2, rate: expect.closeTo(200 / 3) },
  ]);
  expect(buildUserAnalytics(rows, "sport").firstTryByGrade[0].rows[0]).toMatchObject({
    sends: 5,
    firstTries: 4,
  });
  expect(buildUserAnalytics(rows, "boulder", undefined, [2024]).volume[0]).toMatchObject({
    days: 1,
  });
  expect(buildUserAnalytics(rows, "boulder", undefined, [2022]).volume).toEqual([]);
});

describe("inDateWindow", () => {
  const FROM = "2026-03-10";
  const TO = "2026-03-20";

  it("includes both ends, so a one-day window contains its day", () => {
    expect(inDateWindow("2026-03-10", FROM, TO)).toBe(true);
    expect(inDateWindow("2026-03-20", FROM, TO)).toBe(true);
    expect(inDateWindow("2026-03-15", FROM, TO)).toBe(true);
    expect(inDateWindow("2026-03-10", "2026-03-10", "2026-03-10")).toBe(true);
  });

  it("excludes the days either side", () => {
    expect(inDateWindow("2026-03-09", FROM, TO)).toBe(false);
    expect(inDateWindow("2026-03-21", FROM, TO)).toBe(false);
  });

  it("excludes an undated row, unlike an empty year selection", () => {
    // The distinction that matters: "all years" admits a null date, a window
    // cannot, because a send with no date cannot be shown to fall in it.
    expect(inDateWindow(null, FROM, TO)).toBe(false);
  });
});

describe("analytics scoped to a window", () => {
  it("reports only what happened inside it, with no lifetime history leaking in", () => {
    const rows = [
      send({ dateSent: "2020-01-01", suggestedGrade: 9 }),
      send({ dateSent: "2026-03-15", suggestedGrade: 4 }),
      send({ dateSent: null, suggestedGrade: 7 }),
    ];
    const windowed = rows.filter((row) => inDateWindow(row.dateSent, "2026-03-10", "2026-03-20"));

    expect(windowed).toHaveLength(1);
    const analytics = buildUserAnalytics(windowed, "boulder", undefined, []);
    // The V9 from 2020 is the climber's hardest ever and must not be reported
    // as the hardest of a trip it falls outside.
    expect(analytics.hardest.map((entry) => entry.grade)).toEqual([4]);
    expect(analytics.volume.map((month) => month.month)).toEqual(["2026-03"]);
  });
});
