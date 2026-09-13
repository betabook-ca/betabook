import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { StatTiles } from "./analytics-stat-tiles";
const meta = {
  title: "Components/Data display/Analytics stats",
  component: StatTiles,
} satisfies Meta<typeof StatTiles>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Summary: Story = {
  args: {
    tiles: [
      { label: "Sends", value: 124 },
      { label: "Hardest", value: "V6", sub: "Cedar Arete" },
      { label: "Longest send streak", value: "4 days", sub: "Aug 2026" },
    ],
    className: "grid-cols-2 sm:grid-cols-3",
  },
  render: (args) => (
    <StoryPage title="At a glance">
      <StatTiles {...args} />
    </StoryPage>
  ),
};
