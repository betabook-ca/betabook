import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { DemoFeed } from "./social-tour-previews";

const meta = {
  title: "Components/Tutorials/Social previews",
  component: DemoFeed,
  decorators: [
    (Story) => (
      <StoryPage
        title="Tutorial feed"
        description="The tutorial uses the same bordered treatment as the real feed. Filters change only the fictional entries."
      >
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof DemoFeed>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Feed: Story = {};
