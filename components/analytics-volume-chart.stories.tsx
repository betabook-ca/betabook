import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { sessionChartRows } from "@/lib/chart-details";
import {
  activitySends,
  activitySessions,
  activityAnalytics,
} from "@/stories/fixtures/chart-activity";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { AnalyticsVolumeChart } from "./analytics-volume-chart";

const meta = {
  title: "Components/Charts/Volume over time",
  component: AnalyticsVolumeChart,
  args: {
    type: "boulder",
    journalVisible: true,
    rows: [
      { month: "2024-01", sends: 12, days: 4 },
      { month: "2024-02", sends: 0, days: 2 },
      { month: "2024-03", sends: 8, days: 5 },
      { month: "2024-04", sends: 17, days: 6 },
      { month: "2024-05", sends: 5, days: 3 },
    ],
  },
  decorators: [
    (Story) => (
      <StoryPage title="Volume over time">
        <Story />
      </StoryPage>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "An optional, responsive Recharts line chart with a smooth curve, no dots, and floating hover, tap, and arrow-key details. The line preserves monthly values instead of averaging them. Switch between monthly dated sends and distinct climbing days. Empty months remain visible; selected years, discipline, tags, and journal visibility come from the dashboard’s shared calculations.",
      },
    },
  },
} satisfies Meta<typeof AnalyticsVolumeChart>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Monthly: Story = {
  args: {
    rows: activityAnalytics.volume,
    sends: activitySends,
    activities: sessionChartRows(activitySessions, activitySends),
    journalVisible: true,
  },
};
export const Empty: Story = { args: { rows: [] } };

export const LongHistory: Story = {
  args: {
    rows: Array.from({ length: 120 }, (_, i) => ({
      month: `${2016 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
      sends: (i * 7) % 31,
      days: (i * 3) % 15,
    })),
  },
};

export const SingleMonth: Story = { args: { rows: [{ month: "2026-01", sends: 6, days: 2 }] } };
export const NoActivity: Story = {
  args: {
    rows: [
      { month: "2026-01", sends: 0, days: 0 },
      { month: "2026-02", sends: 0, days: 0 },
    ],
  },
};
