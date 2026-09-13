import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { Skeleton } from "./skeleton";
import { SkeletonFeedCard, SkeletonListRows, SkeletonStatCard } from "./skeleton";
const meta = {
  title: "Components/Feedback/Skeleton",
  component: Skeleton,
  args: { className: "h-6 w-40" },
  decorators: [
    (Story) => (
      <StoryPage title="Skeleton">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Raised: Story = {
  render: (args) => (
    <div className="bg-surface-secondary p-4">
      <Skeleton {...args} tone="raised" />
    </div>
  ),
};
export const ListRows: Story = { render: () => <SkeletonListRows rows={3} /> };
export const StatCard: Story = { render: () => <SkeletonStatCard stats={2} /> };
export const FeedCard: Story = { render: () => <SkeletonFeedCard /> };
