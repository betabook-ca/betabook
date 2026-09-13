import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";

import { chartSends } from "@/stories/fixtures/chart-sends";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ChartClimbDetails } from "./chart-climb-details";

const meta = {
  title: "Components/Charts/Climb details",
  component: ChartClimbDetails,
  parameters: {
    docs: {
      description: {
        component:
          "One selected chart value, its relevant metric, and up to three unique climb names. Only larger lists expand into a compact read-only list. Content-sized popups use an X to close. Names are sorted by send date, undated last. No date subgroups, per-climb dates, or links. Single-climb progression points omit the send count.",
      },
    },
  },
} satisfies Meta<typeof ChartClimbDetails>;
export default meta;
type Story = StoryObj<typeof meta>;
export const LargeGroup: Story = {
  args: {
    label: "V2",
    sends: chartSends(60, 3).map((send, i) =>
      i === 0
        ? { ...send, climbName: "The Long Traverse Across the Entire Northern Face of the Boulder" }
        : send,
    ),
    children: "View 60 sends",
  },
  render: (args) => (
    <StoryPage title="Chart climb details">
      <ChartClimbDetails {...args} />
    </StoryPage>
  ),
};

export const CompactPopup: Story = {
  args: { label: "V2", sends: chartSends(4, 3), children: "View climbs" },
  render: (args) => (
    <StoryPage title="Compact climb details">
      <ChartClimbDetails {...args} />
    </StoryPage>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /Show all climbs/ }));
  },
};
