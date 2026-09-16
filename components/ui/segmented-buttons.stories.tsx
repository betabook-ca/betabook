import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useArgs } from "storybook/preview-api";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { SegmentedButtons } from "./segmented-buttons";
const meta = {
  title: "Components/Inputs/Segmented buttons",
  component: SegmentedButtons,
  args: {
    value: "solid",
    options: [
      { value: "low", label: "Low end" },
      { value: "solid", label: "Solid" },
      { value: "high", label: "High end" },
    ],
    onChange: () => {},
  },
  decorators: [
    (Story) => (
      <StoryPage title="Segmented buttons">
        <Story />
      </StoryPage>
    ),
  ],
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <SegmentedButtons {...args} onChange={(value) => updateArgs({ value })} />;
  },
} satisfies Meta<typeof SegmentedButtons>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
