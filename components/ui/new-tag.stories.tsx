import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { NewTag } from "./new-tag";

const meta = {
  title: "Components/New tag",
  component: NewTag,
  decorators: [
    (Story) => (
      <StoryPage title="New tag">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof NewTag>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const InNavigation: Story = {
  render: () => (
    <div className="flex items-center gap-2 text-sm">
      Journal tags <NewTag />
    </div>
  ),
};
