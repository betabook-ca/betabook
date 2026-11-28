import type { Meta, StoryObj } from "@storybook/react-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { Eyebrow, PanelHeader } from "./eyebrow";
const meta = {
  title: "Components/Data display/Eyebrow",
  component: Eyebrow,
  args: { children: "North Woods" },
  decorators: [
    (Story) => (
      <StoryPage title="Eyebrow">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof Eyebrow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Text: Story = {};
export const ChartCardHeader: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <PanelHeader title="Grade pyramid" description="Sends per grade, hardest on top." />
      <PanelHeader
        title="Volume over time"
        description="Dated sends each month."
        actions={<span className="text-sm text-muted">Controls</span>}
      />
    </div>
  ),
};
