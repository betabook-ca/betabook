import type { ComponentProps } from "react";

import type { GoalPanel } from "@/components/goals/goal-panel";
import { summarizeGoalPeriods, pageGoalHistory } from "@/lib/goal-history";
import type { GoalProgress } from "@/lib/goals";

export const goalStoryNow = new Date("2026-09-11T12:00:00Z");
const base: GoalProgress = {
  id: 1,
  userId: "story-goals",
  kind: "volume",
  target: 5,
  discipline: "boulder",
  grade: 4,
  timeframe: "year",
  repeat: "none",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  periodStart: "2026-01-01",
  periodEnd: "2026-12-31",
  timezone: "UTC",
  progress: 2,
  completedDate: null,
};
export const goalStoryPeriods: GoalProgress[] = [
  base,
  {
    ...base,
    id: 2,
    kind: "new-areas",
    discipline: null,
    grade: null,
    target: 10,
    progress: 4,
    timeframe: "custom",
    startDate: "2026-06-01",
    endDate: "2026-11-30",
    periodStart: "2026-06-01",
    periodEnd: "2026-11-30",
  },
  ...Array.from({ length: 9 }, (_, i): GoalProgress => {
    const start = new Date("2026-07-13T12:00:00Z");
    start.setUTCDate(start.getUTCDate() + i * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const ps = start.toISOString().slice(0, 10);
    const pe = end.toISOString().slice(0, 10);
    const progress = i === 8 ? 2 : i === 2 || i === 6 ? 1 : 3;
    return {
      ...base,
      id: 3,
      kind: "training",
      discipline: null,
      grade: null,
      target: 3,
      repeat: "week",
      timeframe: "week",
      startDate: "2026-07-13",
      endDate: "2026-07-19",
      periodStart: ps,
      periodEnd: pe,
      progress,
      completedDate: progress >= 3 ? pe : null,
    };
  }),
  ...Array.from({ length: 5 }, (_, i): GoalProgress => {
    const month = String(i + 5).padStart(2, "0");
    const ps = `2026-${month}-01`;
    const pe = new Date(Date.UTC(2026, i + 5, 0)).toISOString().slice(0, 10);
    return {
      ...base,
      id: 4,
      kind: "training",
      discipline: null,
      grade: null,
      target: 8,
      repeat: "month",
      timeframe: "month",
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      periodStart: ps,
      periodEnd: pe,
      progress: i === 1 ? 5 : i === 4 ? 4 : 8,
      completedDate: i === 1 || i === 4 ? null : pe,
    };
  }),
  ...Array.from({ length: 18 }, (_, i): GoalProgress => ({
    ...base,
    id: 10 + i,
    kind: i % 2 ? "new-areas" : "volume",
    discipline: i % 2 ? null : "boulder",
    grade: i % 2 ? null : 4,
    target: i % 2 ? 10 : 5,
    progress: i % 2 ? 10 : 5,
    completedDate: `2026-09-${String(10 - Math.floor(i / 2)).padStart(2, "0")}`,
  })),
  {
    ...base,
    id: 99,
    progress: 5,
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    completedDate: "2025-12-20",
  },
];
export const goalPanelStoryArgs = {
  ownerId: "story-goals",
  isOwner: true,
  today: "2026-09-11",
  timezone: "UTC",
  initialActive: summarizeGoalPeriods(goalStoryPeriods, "active", 0, goalStoryNow),
  initialCompleted: summarizeGoalPeriods(goalStoryPeriods, "completed", 0, goalStoryNow),
  nextGrades: { boulder: 6, sport: 6, trad: 6 },
  loadPage: async (view, offset, year) =>
    summarizeGoalPeriods(goalStoryPeriods, view, offset, goalStoryNow, year),
  loadItems: async (goal) =>
    (goal.kind === "new-areas"
      ? [
          "Castle Rock",
          "Bishop",
          "Yosemite Valley",
          "Joshua Tree",
          "Red Rock",
          "Joe’s Valley",
          "Squamish",
          "Leavenworth",
          "Smith Rock",
          "Little Cottonwood Canyon",
        ]
      : ["Cedar Arete", "Sun Slab", "Pine Traverse", "Granite Corner", "Moss Mantle"]
    ).map((name, id) => ({ id, name, type: goal.kind === "new-areas" ? "area" : "climb" })),
  loadHistory: async (id, offset, anchor) => {
    const periods = goalStoryPeriods.filter((goal) => goal.id === id);
    return pageGoalHistory(periods, periods[0]?.repeat ?? "week", offset, goalStoryNow, anchor);
  },
} satisfies ComponentProps<typeof GoalPanel>;

export function goalHistorySample(id: number) {
  const goal = summarizeGoalPeriods(
    goalStoryPeriods.filter((goal) => goal.id === id),
    "completed",
    0,
    goalStoryNow,
  ).goals[0];
  if (!goal) throw new Error(`Missing completed history fixture ${id}`);
  return goal;
}
