import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { activitySends, activityAnalytics } from "@/stories/fixtures/chart-activity";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { AnalyticsFlashChart } from "./analytics-flash-chart";

const meta = {
  title: "Components/Charts/First-try rate by grade",
  component: AnalyticsFlashChart,
  args: {
    type: "boulder",
    rows: [
      { grade: 3, label: "V2", sends: 20, firstTries: 15, rate: 75 },
      { grade: 4, label: "V3", sends: 30, firstTries: 12, rate: 40 },
      { grade: 5, label: "V4", sends: 16, firstTries: 4, rate: 25 },
      { grade: 6, label: "V5", sends: 8, firstTries: 0, rate: 0 },
    ],
  },
  decorators: [
    (Story) => (
      <StoryPage title="First-try rate by grade">
        <Story />
      </StoryPage>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "An optional half-width Recharts chart. The first-try line is smooth and has no dots. Legend labels use series names, with matching axis colors. Colored bars and a smooth contrasting line match the count and percentage axis colors. Flashes and onsights both enter the numerator; boulders only ever have flashes. Hover, tap, or use arrow keys to inspect exact counts and rates.",
      },
    },
  },
} satisfies Meta<typeof AnalyticsFlashChart>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Grades: Story = {
  args: { rows: activityAnalytics.firstTryByGrade[0].rows, sends: activitySends },
};
export const Empty: Story = { args: { rows: [] } };
export const SingleGrade: Story = {
  args: { rows: [{ grade: 3, label: "V2", sends: 1, firstTries: 1, rate: 100 }] },
};

export const NoFirstTries: Story = {
  args: {
    rows: [
      { grade: 3, label: "V2", sends: 10, firstTries: 0, rate: 0 },
      { grade: 4, label: "V3", sends: 4, firstTries: 0, rate: 0 },
    ],
  },
};
