import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { FeedCardHeader } from "./feed-card-content";

const meta = {
  title: "Components/Journal/Feed card header",
  component: FeedCardHeader,
  args: {
    authors: [{ id: "sample-alex", name: "Alex Rivera" }],
    date: "2026-09-01",
    activityCount: 5,
  },
} satisfies Meta<typeof FeedCardHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Authors: Story = {
  render: (args) => (
    <StoryPage title="Feed card header">
      <FeedCardHeader {...args} />
    </StoryPage>
  ),
};
