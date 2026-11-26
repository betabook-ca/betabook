import { expect, it } from "vitest";

import { summarizeGoalPeriods } from "./goal-history";
import type { GoalProgress } from "./goals";

const base: GoalProgress = {
  id: 1,
  userId: "owner",
  kind: "training",
  target: 3,
  discipline: null,
  grade: null,
  timeframe: "month",
  repeat: "month",
  startDate: "2025-12-01",
  endDate: "2025-12-31",
  periodStart: "2025-12-01",
  periodEnd: "2025-12-31",
  timezone: "UTC",
  progress: 3,
  completedDate: "2025-12-20",
};
it("summarizes selected years separately, uses historical targets and excludes unfinished months", () => {
  const periods = [
    base,
    {
      ...base,
      target: 8,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      progress: 5,
      completedDate: null,
    },
    {
      ...base,
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      progress: 0,
      completedDate: null,
    },
    { ...base, id: 2, repeat: "none" as const, completedDate: "2026-01-03" },
  ];
  const now = new Date("2026-02-15T12:00:00Z");
  const current = summarizeGoalPeriods(periods, "completed", 0, now);
  expect(current.summary).toMatchObject({
    year: 2026,
    achieved: 1,
  });
  expect(current.years).toEqual([2026, 2025]);
  const previous = summarizeGoalPeriods(periods, "completed", 0, now, 2025);
  expect(previous.summary).toMatchObject({ achieved: 1 });
  expect(previous.goals).toHaveLength(1);
});
it("paginates grouped goals rather than individual successful periods", () => {
  const periods = Array.from({ length: 7 }, (_, i) => ({ ...base, id: i + 1 }));
  const now = new Date("2026-02-15T12:00:00Z");
  const page = summarizeGoalPeriods(periods, "completed", 0, now, 2025);
  expect(page.total).toBe(7);
  expect(page.hasMore).toBe(true);
  expect(page.goals).toHaveLength(5);
  const next = summarizeGoalPeriods(periods, "completed", 5, now, 2025);
  expect(next.goals).toHaveLength(2);
  expect(next.hasMore).toBe(false);
  expect(new Set([...page.goals, ...next.goals].map((g) => g.id)).size).toBe(7);
});

it("records a met current month immediately and reverses it when progress falls below target", () => {
  const now = new Date("2026-09-12T12:00:00Z");
  const goal = {
    ...base,
    target: 1,
    progress: 1,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    completedDate: "2026-09-11",
  };
  const completed = summarizeGoalPeriods([goal], "completed", 0, now);
  expect(completed.goals).toHaveLength(1);
  expect(completed.summary).toMatchObject({ achieved: 1 });
  expect(summarizeGoalPeriods([goal], "active", 0, now).goals).toHaveLength(1);
  const corrected = summarizeGoalPeriods(
    [{ ...goal, progress: 0, completedDate: null }],
    "completed",
    0,
    now,
  );
  expect(corrected.goals).toEqual([]);
  expect(corrected.summary).toMatchObject({ achieved: 0 });
});

it("counts a recurring goal once across successful weeks and defaults to the only history year", () => {
  const first = {
    ...base,
    repeat: "week" as const,
    periodStart: "2025-12-01",
    periodEnd: "2025-12-07",
  };
  const second = { ...first, periodStart: "2025-12-08", periodEnd: "2025-12-14" };
  const page = summarizeGoalPeriods(
    [first, second],
    "completed",
    0,
    new Date("2026-01-01T12:00:00Z"),
  );
  expect(page.summary).toMatchObject({ year: 2025, achieved: 1 });
  expect(page.years).toEqual([2025]);
  expect(page.goals[0].recurring?.met).toBe(2);
});

it("pages weekly history by whole calendar months, including all five August weeks", async () => {
  const { pageGoalHistory } = await import("./goal-history");
  const now = new Date("2026-09-11T12:00:00Z");
  const periods = Array.from({ length: 22 }, (_, i) => {
    const start = new Date("2026-04-13T12:00:00Z");
    start.setUTCDate(start.getUTCDate() + i * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return {
      ...base,
      repeat: "week" as const,
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
    };
  });
  const first = pageGoalHistory(periods, "week", 0, now);
  expect([...new Set(first.periods.map((p) => p.periodStart.slice(0, 7)))]).toEqual([
    "2026-09",
    "2026-08",
    "2026-07",
  ]);
  expect(first.periods.filter((p) => p.periodStart.startsWith("2026-08"))).toHaveLength(5);
  expect(first.nextOffset).toBe(3);
  expect(first.hasMore).toBe(true);
  const second = pageGoalHistory(periods, "week", first.nextOffset, now);
  expect([...new Set(second.periods.map((p) => p.periodStart.slice(0, 7)))]).toEqual([
    "2026-06",
    "2026-05",
    "2026-04",
  ]);
  expect(second.hasMore).toBe(false);
  expect(first.periods.length + second.periods.length).toBe(periods.length);
});

it("pages monthly history twelve whole months at a time across years", async () => {
  const { pageGoalHistory } = await import("./goal-history");
  const now = new Date("2026-09-11T12:00:00Z");
  const periods = Array.from({ length: 24 }, (_, i) => {
    const start = new Date(Date.UTC(2024, 9 + i, 1));
    const end = new Date(Date.UTC(2024, 10 + i, 0));
    return {
      ...base,
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
    };
  });
  const first = pageGoalHistory(periods, "month", 0, now);
  expect(first.periods).toHaveLength(12);
  expect(first.periods[11].periodStart).toBe("2025-10-01");
  expect(first.nextOffset).toBe(12);
  expect(first.hasMore).toBe(true);
  const second = pageGoalHistory(periods, "month", first.nextOffset, now);
  expect(second.periods).toHaveLength(12);
  expect(second.hasMore).toBe(false);
});

it("keeps month paging anchored when the calendar rolls over", async () => {
  const { pageGoalHistory } = await import("./goal-history");
  const periods = Array.from({ length: 9 }, (_, i) => ({
    ...base,
    periodStart: `2026-${String(i + 1).padStart(2, "0")}-01`,
    periodEnd: new Date(Date.UTC(2026, i + 1, 0)).toISOString().slice(0, 10),
  }));
  const first = pageGoalHistory(periods, "week", 0, new Date("2026-09-30T12:00:00Z"));
  const october = { ...base, periodStart: "2026-10-01", periodEnd: "2026-10-31" };
  const next = pageGoalHistory(
    [...periods, october],
    "week",
    first.nextOffset,
    new Date("2026-10-01T12:00:00Z"),
    first.anchorMonth,
  );
  expect(next.periods.map((p) => p.periodStart.slice(0, 7))).toEqual([
    "2026-06",
    "2026-05",
    "2026-04",
  ]);
});

it("attributes a successful New Year week to the month and year in its label", () => {
  const week = {
    ...base,
    repeat: "week" as const,
    periodStart: "2026-12-28",
    periodEnd: "2027-01-03",
    completedDate: "2026-12-29",
  };
  const page = summarizeGoalPeriods([week], "completed", 0, new Date("2026-12-30T12:00:00Z"), 2026);
  expect(page.goals).toHaveLength(1);
  expect(page.years).toEqual([2026]);
});
it("orders achievements by the day met rather than a recurring period's future end", () => {
  const monthly = {
    ...base,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    completedDate: "2026-09-02",
  };
  const once = { ...monthly, id: 2, repeat: "none" as const, completedDate: "2026-09-20" };
  expect(
    summarizeGoalPeriods(
      [monthly, once],
      "completed",
      0,
      new Date("2026-09-21T12:00:00Z"),
    ).goals.map((g) => g.id),
  ).toEqual([2, 1]);
});

it("pages yearly history in complete five-year windows", async () => {
  const { pageGoalHistory } = await import("./goal-history");
  const periods = Array.from({ length: 8 }, (_, index) => ({
    id: 99,
    userId: "owner",
    kind: "volume" as const,
    discipline: "boulder" as const,
    grade: 6,
    target: 8,
    timeframe: "year" as const,
    repeat: "year" as const,
    timezone: "UTC",
    startDate: "2019-01-01",
    endDate: "2019-12-31",
    periodStart: `${2019 + index}-01-01`,
    periodEnd: `${2019 + index}-12-31`,
    progress: 8,
    completedDate: `${2019 + index}-08-01`,
  }));
  const now = new Date("2026-09-11T12:00:00Z");
  const first = pageGoalHistory(periods, "year", 0, now);
  expect(first.periods.map((period) => period.periodStart.slice(0, 4))).toEqual([
    "2026",
    "2025",
    "2024",
    "2023",
    "2022",
  ]);
  expect(first.hasMore).toBe(true);
  const second = pageGoalHistory(periods, "year", first.nextOffset, now, first.anchorMonth);
  expect(second.periods.map((period) => period.periodStart.slice(0, 4))).toEqual([
    "2021",
    "2020",
    "2019",
  ]);
  expect(second.hasMore).toBe(false);
});

it("moves month-old missed goals out of Active without counting them as achievements", () => {
  const missed = {
    ...base,
    repeat: "none" as const,
    progress: 0,
    completedDate: null,
    periodStart: "2026-08-31",
    periodEnd: "2026-09-06",
  };
  const now = new Date("2026-10-20T12:00:00Z");
  expect(summarizeGoalPeriods([missed], "active", 0, now).goals).toEqual([]);
  const completed = summarizeGoalPeriods([missed], "completed", 0, now);
  expect(completed.goals).toHaveLength(1);
  expect(completed.summary?.achieved).toBe(0);
});

it("deduplicates a former routine and retains its history under the one-time result", () => {
  const old = {
    ...base,
    repeat: "week" as const,
    progress: 3,
    completedDate: "2026-08-03",
    periodStart: "2026-08-03",
    periodEnd: "2026-08-09",
  };
  const current = {
    ...base,
    repeat: "none" as const,
    progress: 3,
    completedDate: "2026-09-02",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
  };
  const page = summarizeGoalPeriods(
    [old, current],
    "completed",
    0,
    new Date("2026-09-11T12:00:00Z"),
  );
  expect(page.total).toBe(1);
  expect(page.goals[0].repeat).toBe("none");
  expect(page.goals[0].recurring?.total).toBe(1);
});

it("keeps missed goals actionable for a calendar month, then moves them to history", () => {
  const missed = {
    ...base,
    repeat: "none" as const,
    progress: 0,
    completedDate: null,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
  };
  const during = new Date("2026-09-29T12:00:00Z");
  expect(summarizeGoalPeriods([missed], "active", 0, during).goals).toHaveLength(1);
  expect(summarizeGoalPeriods([missed], "completed", 0, during).goals).toHaveLength(0);
  const elapsed = new Date("2026-10-01T12:00:00Z");
  expect(summarizeGoalPeriods([missed], "active", 0, elapsed).goals).toHaveLength(0);
  expect(summarizeGoalPeriods([missed], "completed", 0, elapsed).goals).toHaveLength(1);
  expect(
    summarizeGoalPeriods([{ ...missed, archived: true }], "completed", 0, during).goals,
  ).toHaveLength(1);
});

it("moves finished one-time goals to History without an archive action", () => {
  const periods = Array.from({ length: 12 }, (_, i) => ({
    ...base,
    id: i + 1,
    repeat: "none" as const,
    archived: i === 0,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    completedDate: "2026-09-02",
  }));
  const now = new Date("2026-09-12T12:00:00Z");
  expect(summarizeGoalPeriods(periods, "active", 0, now).goals).toEqual([]);
  const history = summarizeGoalPeriods(periods, "completed", 0, now);
  expect(history.total).toBe(12);
  expect(history.goals).toHaveLength(5);
  expect(history.summary?.achieved).toBe(12);
});
