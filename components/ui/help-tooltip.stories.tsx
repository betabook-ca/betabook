import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { HelpTooltip } from "./help-tooltip";

const meta = {
  title: "Components/Forms/Help tooltip",
  component: HelpTooltip,
  args: {
    label: "About Send commentary",
    children: "Uses your Send commentary audience wherever this note appears.",
  },
} satisfies Meta<typeof HelpTooltip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FieldHelp: Story = {
  render: (args) => (
    <StoryPage title="Field help">
      <div className="flex items-center gap-1">
        <span>Send commentary</span>
        <HelpTooltip {...args} />
      </div>
    </StoryPage>
  ),
};
