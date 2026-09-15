import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";

import { GoalPanel } from "@/components/goals/goal-panel";
import { summarizeGoalPeriods, pageGoalHistory } from "@/lib/goal-history";
import { GoalPageContext } from "@/stories/fixtures/goal-page-demo";
import {
  goalPanelStoryArgs,
  goalStoryNow,
  goalStoryPeriods,
} from "@/stories/fixtures/goal-samples";
import { StoryPage } from "@/stories/fixtures/story-layout";

const meta = {
  title: "Patterns/Goals",
  component: GoalPanel,
  args: goalPanelStoryArgs,
  decorators: [
    (Story) => (
      <StoryPage title="Goals">
        <Story />
      </StoryPage>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Production goals on their own Goals page in Progress with deterministic local data. Dates, grouped recurring history, missed periods, year selection, pagination and contribution details use the real components. Form examples live under Components / Goals / Goal form. Story mutations do not persist.",
      },
    },
  },
} satisfies Meta<typeof GoalPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const GoalsPage: Story = { render: () => <GoalPageContext /> };
export const NoGoals: Story = { render: () => <GoalPageContext empty /> };
export const CompletedGoals: Story = { args: { initialView: "completed" } };
export const RecurringHistory: Story = {
  args: {
    initialView: "active",
    initialActive: summarizeGoalPeriods(
      goalStoryPeriods.filter((g) => g.id === 3),
      "active",
      0,
      goalStoryNow,
    ),
  },
};
export const MonthlyRecurringHistory: Story = {
  args: {
    initialView: "active",
    initialActive: summarizeGoalPeriods(
      goalStoryPeriods.filter((g) => g.id === 4),
      "active",
      0,
      goalStoryNow,
    ),
  },
};

export const CompletedGoalDetails: Story = {
  args: { initialView: "completed" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByRole("button", { name: "5 climbs" })[0]);
    await userEvent.click(canvas.getAllByRole("button", { name: "10 areas" })[0]);
  },
};

export const GoalAchieved: Story = { render: () => <GoalPageContext celebrate /> };

const oneYearPeriods = goalStoryPeriods.filter((goal) => goal.id !== 99);
export const ManyCompletedGoals: Story = {
  args: {
    initialView: "completed",
    initialCompleted: summarizeGoalPeriods(oneYearPeriods, "completed", 0, goalStoryNow),
    loadPage: async (view, offset, year) =>
      summarizeGoalPeriods(oneYearPeriods, view, offset, goalStoryNow, year),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Load more" }));
  },
  parameters: {
    docs: {
      description: {
        story:
          "The real completed list after one Load more click: ten of twenty grouped goals are visible. Each click adds five; recurring periods stay grouped under their routine.",
      },
    },
  },
};

const weeklyHistoryNow = new Date("2026-09-15T12:00:00Z");
const weeklyHistoryGoal = goalStoryPeriods.find((goal) => goal.id === 3);
if (!weeklyHistoryGoal) throw new Error("Missing weekly goal fixture");
const weeklyHistoryPeriods = [
  ...goalStoryPeriods.filter((goal) => goal.id === 3),
  {
    ...weeklyHistoryGoal,
    periodStart: "2026-09-14",
    periodEnd: "2026-09-20",
    progress: 1,
    completedDate: null,
  },
];
export const WeeklyCompletedHistory: Story = {
  args: {
    today: "2026-09-15",
    initialView: "completed",
    initialActive: summarizeGoalPeriods(weeklyHistoryPeriods, "active", 0, weeklyHistoryNow),
    initialCompleted: summarizeGoalPeriods(weeklyHistoryPeriods, "completed", 0, weeklyHistoryNow),
    loadPage: async (view, offset, year) =>
      summarizeGoalPeriods(weeklyHistoryPeriods, view, offset, weeklyHistoryNow, year),
    loadHistory: async (id, offset, anchor) =>
      pageGoalHistory(
        weeklyHistoryPeriods.filter((goal) => goal.id === id),
        "week",
        offset,
        weeklyHistoryNow,
        anchor,
      ),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "See history" }));
  },
  parameters: {
    docs: {
      description: {
        story:
          "A single recurring goal in Completed, expanded across July, August and September. Each numbered circle represents a week starting in that month; successes and misses stay in the same history.",
      },
    },
  },
};
const monthlyHistoryPeriods = goalStoryPeriods.filter((goal) => goal.id === 4);
export const MonthlyCompletedHistory: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "See history" }));
  },
  args: {
    initialView: "completed",
    initialActive: summarizeGoalPeriods(monthlyHistoryPeriods, "active", 0, goalStoryNow),
    initialCompleted: summarizeGoalPeriods(monthlyHistoryPeriods, "completed", 0, goalStoryNow),
    loadPage: async (view, offset, year) =>
      summarizeGoalPeriods(monthlyHistoryPeriods, view, offset, goalStoryNow, year),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Monthly training history: met in May, July and August, missed in June. September remains active and is not marked missed.",
      },
    },
  },
};

const longWeeklyPeriods = Array.from({ length: 22 }, (_, index) => {
  const start = new Date("2026-04-13T12:00:00Z");
  start.setUTCDate(start.getUTCDate() + index * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const progress = index % 4 === 1 ? 1 : 3;
  return {
    ...weeklyHistoryGoal,
    startDate: "2026-04-13",
    endDate: "2026-04-19",
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
    progress,
    completedDate: progress === 3 ? start.toISOString().slice(0, 10) : null,
  };
});
const monthlyHistoryGoal = monthlyHistoryPeriods[0];
const longMonthlyPeriods = Array.from({ length: 24 }, (_, index) => {
  const start = new Date(Date.UTC(2024, 9 + index, 1));
  const end = new Date(Date.UTC(2024, 10 + index, 0));
  const progress = index % 4 === 1 ? 5 : 8;
  return {
    ...monthlyHistoryGoal,
    startDate: "2024-10-01",
    endDate: "2024-10-31",
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
    progress,
    completedDate: progress === 8 ? start.toISOString().slice(0, 10) : null,
  };
});
function paginatedHistoryArgs(periods: typeof goalStoryPeriods) {
  return {
    initialView: "completed" as const,
    initialActive: summarizeGoalPeriods(periods, "active", 0, goalStoryNow),
    initialCompleted: summarizeGoalPeriods(periods, "completed", 0, goalStoryNow),
    loadPage: async (view: "active" | "completed", offset: number, year: number) =>
      summarizeGoalPeriods(periods, view, offset, goalStoryNow, year),
    loadHistory: async (_id: number, offset: number, anchor?: string) =>
      pageGoalHistory(periods, periods[0].repeat, offset, goalStoryNow, anchor),
  };
}
const openRoutineHistory = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  await userEvent.click(within(canvasElement).getByRole("button", { name: "See history" }));
};
export const WeeklyHistoryLoadMore: Story = {
  args: paginatedHistoryArgs(longWeeklyPeriods),
  play: openRoutineHistory,
};
export const MonthlyHistoryLoadMore: Story = {
  args: paginatedHistoryArgs(longMonthlyPeriods),
  play: openRoutineHistory,
};
