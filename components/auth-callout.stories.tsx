import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { AuthCallout } from "./auth-callout";

const meta = {
  title: "Components/Auth/Member content",
  component: AuthCallout,
  decorators: [
    (Story) => (
      <StoryPage title="Member content">
        <Story />
      </StoryPage>
    ),
  ],
  args: { next: "/climbs/1/test-highball" },
} satisfies Meta<typeof AuthCallout>;
export default meta;
type Story = StoryObj<typeof meta>;
export const LockedContent: Story = {};
export const Area: Story = {
  args: {
    next: "/areas/1/test-crag",
    description: "Sign in to see who has climbed these lines and to log your own sessions.",
  },
};
