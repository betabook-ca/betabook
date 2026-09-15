import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { PrimaryNavigationIcon } from "./primary-navigation-icon";

const meta = {
  title: "Components/Navigation/Primary icon",
  component: PrimaryNavigationIcon,
  args: { area: "logbook", account: { name: "Alex Morgan", image: null } },
  decorators: [
    (Story) => (
      <StoryPage title="Navigation icon">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof PrimaryNavigationIcon>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Logbook: Story = {};
export const Progress: Story = { args: { area: "progress" } };
export const Community: Story = { args: { area: "community" } };
export const You: Story = { name: "Account settings", args: { area: "account" } };
