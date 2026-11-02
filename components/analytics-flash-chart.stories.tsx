import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { StyleRateGradeRow } from "@/lib/user-analytics";
import { activitySends, activityAnalytics } from "@/stories/fixtures/chart-activity";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { AnalyticsFlashChart } from "./analytics-flash-chart";

function row(
  grade: number,
  label: string,
  sends: number,
  flashes: number,
  onsights = 0,
): StyleRateGradeRow {
  return {
    grade,
    range: [grade, grade],
    label,
    sends,
    flashes,
    onsights,
    flashRate: (flashes / sends) * 100,
    onsightRate: (onsights / sends) * 100,
  };
}

const meta = {
  title: "Components/Charts/Flash rate by grade",
  component: AnalyticsFlashChart,
  args: {
    type: "boulder",
    rows: [row(3, "V2", 20, 15), row(4, "V3", 30, 12), row(5, "V4", 16, 4), row(6, "V5", 8, 0)],
  },
  decorators: [
    (Story) => (
      <StoryPage title="Flash rate by grade">
        <Story />
      </StoryPage>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "An optional half-width Recharts chart. Neutral bars count sends per grade, and smooth dotless lines overlay the flash rate (flash-chip blue) and, on ropes, the onsight rate (onsight-chip green); each counts only its own style, like the Flash and Onsight stat cards. Boulders can't be onsighted, so bouldering draws the flash line alone. Legend labels name each series in its color. Hover, tap, or use arrow keys to inspect exact counts and rates.",
      },
    },
  },
} satisfies Meta<typeof AnalyticsFlashChart>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Grades: Story = {
  args: { rows: activityAnalytics.styleRatesByGrade[0].rows, sends: activitySends },
};
export const FlashAndOnsight: Story = {
  args: {
    type: "sport",
    rows: [
      row(10, "5.10a", 12, 3, 6),
      row(11, "5.10b", 9, 2, 3),
      row(12, "5.10c", 6, 1, 1),
      row(13, "5.10d", 4, 0, 0),
    ],
  },
};
export const Empty: Story = { args: { rows: [] } };
export const SingleGrade: Story = {
  args: { rows: [row(3, "V2", 1, 1)] },
};

export const NoFirstTries: Story = {
  args: {
    rows: [row(3, "V2", 10, 0), row(4, "V3", 4, 0)],
  },
};
