import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent } from "storybook/test";

import { sendChartRows } from "@/lib/chart-details";
import { activitySends } from "@/stories/fixtures/chart-activity";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ChartInspection } from "./chart-inspection";

const meta = {
  title: "Components/Charts/Chart inspection",
  component: ChartInspection,
  decorators: [
    (Story) => (
      <StoryPage title="Chart inspection">
        <Story />
      </StoryPage>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Content-sized floating tooltips inside the chart for pointer, touch, and keyboard exploration. No permanent instruction or readout appears below the plot. Focus the plot and use arrow keys, Home, or End to inspect values; Escape clears the readout.",
      },
    },
  },
} satisfies Meta<typeof ChartInspection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DataPoints: Story = {
  play: async () => {
    await userEvent.tab();
    await userEvent.keyboard("{Home}");
  },
  args: {
    label: "Monthly sends",
    details: Object.fromEntries(
      [3, 4, 1].map((count, i) => [
        `${["January", "February", "March"][i]}: ${count} sends`,
        {
          title: `${["Jan", "Feb", "Mar"][i]} 2026`,
          summary: `${count} ${count === 1 ? "send" : "sends"}`,
          rows: sendChartRows(
            activitySends.filter((send) => send.dateSent?.startsWith(`2026-0${i + 1}-`)),
          ),
        },
      ]),
    ),
    children: (
      <svg viewBox="0 0 320 120" className="w-full max-w-md" aria-hidden>
        <path d="M 30 60 L 150 40 L 290 90" fill="none" className="stroke-accent" strokeWidth={3} />
        {[60, 40, 90].map((y, i) => (
          <circle
            key={y}
            cx={[30, 150, 290][i]}
            cy={y}
            r={12}
            className="fill-accent"
            data-chart-detail={`${["January", "February", "March"][i]}: ${[3, 4, 1][i]} sends`}
          />
        ))}
      </svg>
    ),
  },
};
