import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useState } from "react";
import { mocked } from "storybook/test";

import { archiveGoal, saveGoal } from "@/actions";
import { summarizeGoalPeriods } from "@/lib/goal-history";
import { goalInputSchema, goalWindow, type GoalPage, type GoalProgress } from "@/lib/goals";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { GoalPanel } from "./goal-panel";
const meta = {
  title: "Components/Goals/Goal panel",
  component: GoalPanel,
  decorators: [
    (Story) => (
      <StoryPage title="Goals">
        <Story />
      </StoryPage>
    ),
  ],
  args: {
    ownerId: "story-goals",
    timezone: "UTC",
    today: "2026-09-11",
    initialActive: { goals: [], hasMore: false },
    initialCompleted: { goals: [], hasMore: false },
    availableTags: ["hangboard", "strength", "outdoor", "trip"],
  },
} satisfies Meta<typeof GoalPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
const activeTraining: GoalPage = {
  hasMore: false,
  goals: [
    {
      id: -1,
      userId: "story-goals",
      kind: "training",
      target: 8,
      discipline: null,
      grade: null,
      timeframe: "month",
      repeat: "none",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      timezone: "UTC",
      progress: 3,
      completedDate: null,
    },
  ],
};
export const Active: Story = { args: { initialActive: activeTraining } };
export const Empty: Story = {};
export const CrossYearSeason: Story = {
  args: {
    initialActive: {
      hasMore: false,
      goals: [
        {
          id: -2,
          userId: "story-goals",
          kind: "volume",
          target: 8,
          discipline: "boulder",
          grade: 5,
          gradeMatch: "at-least",
          timeframe: "custom",
          repeat: "none",
          startDate: "2026-12-01",
          endDate: "2027-02-28",
          periodStart: "2026-12-01",
          periodEnd: "2027-02-28",
          timezone: "UTC",
          progress: 0,
          completedDate: null,
        },
      ],
    },
  },
};

const metMonthlyGoal = {
  id: -3,
  userId: "story-goals",
  kind: "training",
  target: 1,
  discipline: null,
  grade: null,
  timeframe: "month",
  repeat: "month",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  timezone: "UTC",
  progress: 1,
  completedDate: "2026-09-02",
} as const;
export const MonthlyTargetMet: Story = {
  args: {
    initialActive: summarizeGoalPeriods(
      [metMonthlyGoal],
      "active",
      0,
      new Date("2026-09-11T12:00:00Z"),
    ),
    initialCompleted: summarizeGoalPeriods(
      [metMonthlyGoal],
      "completed",
      0,
      new Date("2026-09-11T12:00:00Z"),
    ),
  },
};

const weeklyPeriods = [7, 14, 21, 28].map((day, index) => ({
  ...metMonthlyGoal,
  id: -4,
  repeat: "week" as const,
  timeframe: "week" as const,
  target: 3,
  startDate: "2026-09-07",
  endDate: "2026-09-13",
  periodStart: `2026-09-${String(day).padStart(2, "0")}`,
  periodEnd: index === 3 ? "2026-10-04" : `2026-09-${day + 6}`,
  progress: index === 2 ? 1 : 3,
  completedDate: index === 2 ? null : `2026-09-${String(day + 1).padStart(2, "0")}`,
}));
const weeklyConsistency = [
  ...weeklyPeriods,
  {
    ...weeklyPeriods[0],
    periodStart: "2026-10-05",
    periodEnd: "2026-10-11",
    progress: 1,
    completedDate: null,
  },
];
export const WeeklyConsistency: Story = {
  args: {
    today: "2026-10-06",
    initialActive: summarizeGoalPeriods(
      weeklyConsistency,
      "active",
      0,
      new Date("2026-10-06T12:00:00Z"),
    ),
    initialCompleted: summarizeGoalPeriods(
      weeklyConsistency,
      "completed",
      0,
      new Date("2026-10-06T12:00:00Z"),
    ),
  },
};

const missedGoal = {
  id: -50,
  userId: "story-goals",
  kind: "training" as const,
  target: 8,
  discipline: null,
  grade: null,
  repeat: "none" as const,
  timeframe: "month" as const,
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  progress: 5,
  completedDate: null,
  timezone: "UTC",
};
export const MissedGoal: Story = {
  args: { initialActive: { goals: [missedGoal], hasMore: false } },
  render: function MissedGoalExample(args) {
    const emptyHistory: GoalPage = {
      goals: [],
      hasMore: false,
      total: 0,
      summary: { year: 2026, achieved: 0 },
      years: [2026],
    };
    const [pages, setPages] = useState({
      active: { goals: [missedGoal] as GoalProgress[], hasMore: false },
      history: emptyHistory,
    });
    useEffect(() => {
      const history: GoalPage = {
        goals: [{ ...missedGoal, archived: true }],
        hasMore: false,
        total: 1,
        summary: { year: 2026, achieved: 0 },
        years: [2026],
      };
      mocked(archiveGoal).mockImplementation(async () => {
        setPages({ active: { goals: [], hasMore: false }, history });
        return { ok: true, value: undefined };
      });
      mocked(saveGoal).mockImplementation(async (_id, raw, retryOf) => {
        if (retryOf === missedGoal.id) {
          const input = goalInputSchema.parse(raw);
          const window = goalWindow(
            input.repeat === "none" ? input.timeframe : input.repeat,
            args.today,
            input.endDate,
            input.startDate,
          );
          const next: GoalProgress = {
            ...input,
            ...window,
            id: -51,
            userId: args.ownerId,
            periodStart: window.startDate,
            periodEnd: window.endDate,
            progress: 0,
            completedDate: null,
          };
          setPages({ active: { goals: [next], hasMore: false }, history });
        }
        return { ok: true, value: -51 };
      });
      return () => {
        mocked(archiveGoal).mockReset().mockResolvedValue({ ok: true, value: undefined });
        mocked(saveGoal).mockReset().mockResolvedValue({ ok: true, value: -1 });
      };
    }, [args.ownerId, args.today]);
    return <GoalPanel {...args} initialActive={pages.active} initialCompleted={pages.history} />;
  },
};
export const MissedGoalInHistory: Story = {
  args: {
    today: "2026-10-01",
    initialView: "completed",
    initialCompleted: summarizeGoalPeriods(
      [missedGoal],
      "completed",
      0,
      new Date("2026-10-01T12:00:00Z"),
    ),
  },
};

const backdatedGoal = {
  id: -51,
  userId: "story-backdated-achievement",
  kind: "training" as const,
  target: 1,
  discipline: null,
  grade: null,
  repeat: "none" as const,
  timeframe: "month" as const,
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  progress: 1,
  completedDate: "2026-08-15",
  timezone: "UTC",
};
export const BackdatedAchievement: Story = {
  args: {
    ownerId: backdatedGoal.userId,
    initialCompleted: {
      goals: [backdatedGoal],
      celebrations: [backdatedGoal],
      hasMore: false,
      total: 1,
      summary: { year: 2026, achieved: 1 },
      years: [2026],
    },
  },
};

const completedFinishes = Array.from({ length: 8 }, (_, i) => ({
  ...backdatedGoal,
  id: -100 - i,
  userId: "story-goals",
  target: i + 1,
  progress: i + 1,
  completedDate: "2026-09-02",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
}));
const completedNow = new Date("2026-09-11T12:00:00Z");
export const CompletedGoalsInHistory: Story = {
  args: {
    initialView: "completed",
    initialCompleted: summarizeGoalPeriods(completedFinishes, "completed", 0, completedNow),
    loadPage: async (view, offset, year) =>
      summarizeGoalPeriods(completedFinishes, view, offset, completedNow, year),
  },
};

export const EndingRoutine: Story = {
  args: {
    initialActive: {
      goals: [{ ...metMonthlyGoal, recurringEndDate: "2026-09-30" }],
      hasMore: false,
    },
  },
  render: function EndingRoutineExample(args) {
    const [routine, setRoutine] = useState(args.initialActive.goals[0]);
    useEffect(() => {
      mocked(saveGoal).mockImplementation(async (_id, raw) => {
        const input = goalInputSchema.parse(raw);
        const endDate = input.recurringEndDate ?? null;
        setRoutine((goal) => ({
          ...goal,
          recurringEndDate: endDate,
          periodEnd: endDate && endDate < goal.endDate ? endDate : goal.endDate,
        }));
        return { ok: true, value: -3 };
      });
      return () => {
        mocked(saveGoal).mockReset().mockResolvedValue({ ok: true, value: -1 });
      };
    }, []);
    return <GoalPanel {...args} initialActive={{ goals: [routine], hasMore: false }} />;
  },
};
export const EndedRoutine: Story = {
  args: {
    today: "2026-10-06",
    initialView: "completed",
    initialCompleted: summarizeGoalPeriods(
      weeklyPeriods.slice(0, 2).map((goal) => ({ ...goal, recurringEndDate: "2026-09-20" })),
      "completed",
      0,
      new Date("2026-10-06T12:00:00Z"),
    ),
  },
};
