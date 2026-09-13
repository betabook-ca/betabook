import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { DISCIPLINE_HUE } from "@/components/ui/discipline-chip";
import { sessionChartRows } from "@/lib/chart-details";
import {
  activitySessions,
  activityAnalytics,
  activitySends,
} from "@/stories/fixtures/chart-activity";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { AnalyticsCalendar } from "./analytics-calendar";
const meta = {
  title: "Components/Charts/Analytics calendar",
  component: AnalyticsCalendar,
  parameters: {
    docs: {
      description: {
        component:
          "Ascending year navigation with an arrow on each side of the year. Only the current calendar is rendered; it fits the card without horizontal scrolling. Hover, tap, or use arrow keys on the day grid for compact floating details.",
      },
    },
  },
} satisfies Meta<typeof AnalyticsCalendar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MultipleYears: Story = {
  args: {
    years: [2024, 2025, 2026],
    countsByDay: { "2026-01-01": 2, "2025-05-03": 3, "2024-08-20": 1 },
    hue: DISCIPLINE_HUE.boulder,
    unit: "send",
  },
  render: (args) => (
    <StoryPage title="Calendar years">
      <AnalyticsCalendar {...args} />
    </StoryPage>
  ),
};
export const SingleYear: Story = {
  ...MultipleYears,
  args: {
    years: [2026],
    countsByDay: activityAnalytics.calendarCounts,
    hue: DISCIPLINE_HUE.boulder,
    unit: "session",
    activities: sessionChartRows(activitySessions, activitySends),
  },
};
