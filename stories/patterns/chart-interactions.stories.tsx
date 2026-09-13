import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { AnalyticsCalendar } from "@/components/analytics-calendar";
import { AnalyticsFlashChart } from "@/components/analytics-flash-chart";
import { AnalyticsVolumeChart } from "@/components/analytics-volume-chart";
import { DISCIPLINE_HUE } from "@/components/ui/discipline-chip";
import { sessionChartRows } from "@/lib/chart-details";
import {
  activityAnalytics,
  activitySends,
  activitySessions,
} from "@/stories/fixtures/chart-activity";
import { Example, StoryPage } from "@/stories/fixtures/story-layout";

const meta = {
  title: "Patterns/Chart interactions",
  component: StoryPage,
  parameters: {
    docs: {
      description: {
        component:
          "Hover or focus to preview up to three entries. Only larger groups open a full list. Each chart keeps its own aggregation and metric. Climb names appear once, with no additional date grouping. Related to [issue #192](https://github.com/betabook-ca/betabook/issues/192).",
      },
    },
  },
} satisfies Meta<typeof StoryPage>;
export default meta;
type Story = StoryObj;

export const Explore: Story = {
  render: () => (
    <StoryPage
      title="Explore the climbs behind your charts"
      description="Try a month, grade, or calendar day. Small groups show all entries in the preview; larger groups open a compact read-only list. Switch to Days out to explore the climbs logged that month."
    >
      <Example title="Monthly sends and Days out">
        <AnalyticsVolumeChart
          type="boulder"
          rows={activityAnalytics.volume}
          sends={activitySends}
          activities={sessionChartRows(activitySessions, activitySends)}
          journalVisible
        />
      </Example>
      <Example title="Flashes by grade">
        <AnalyticsFlashChart
          type="boulder"
          rows={activityAnalytics.flashByGrade[0].rows}
          sends={activitySends}
        />
      </Example>
      <Example title="Daily sessions, including repeats">
        <AnalyticsCalendar
          years={[2026]}
          countsByDay={activityAnalytics.calendarCounts}
          unit="session"
          hue={DISCIPLINE_HUE.boulder}
          activities={sessionChartRows(activitySessions, activitySends)}
        />
      </Example>
    </StoryPage>
  ),
};
