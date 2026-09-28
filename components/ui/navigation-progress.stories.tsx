import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { NavigationProgressBar } from "./navigation-progress";

const meta = {
  title: "Components/Feedback/Navigation progress",
  component: NavigationProgressBar,
  decorators: [
    (Story) => (
      <StoryPage
        title="Navigation progress"
        description="Pinned to the top of the viewport from a link's click until its navigation settles."
      >
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof NavigationProgressBar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Pending: Story = {};
