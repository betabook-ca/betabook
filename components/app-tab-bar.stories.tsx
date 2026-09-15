import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { AppTabs } from "./app-tab-bar";

const meta = {
  title: "Components/Navigation/Tab bar",
  component: AppTabs,
  args: { account: { id: "sample", name: "Alex Morgan", image: null } },
  decorators: [
    (Story) => (
      <StoryPage title="Phone tab bar">
        <nav
          aria-label="Primary"
          className="w-full max-w-md border-y border-separator bg-background"
        >
          <Story />
        </nav>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof AppTabs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Profile: Story = {
  name: "Logbook",
  parameters: { nextjs: { navigation: { pathname: "/users/sample/sends" } } },
};
export const Feed: Story = {
  name: "Community",
  parameters: { nextjs: { navigation: { pathname: "/feed" } } },
};
export const FriendRequests: Story = {
  args: { requestCount: 12 },
  parameters: { nextjs: { navigation: { pathname: "/friends" } } },
};
export const Progress: Story = {
  parameters: { nextjs: { navigation: { pathname: "/users/sample/projects" } } },
};
export const You: Story = {
  name: "Account settings (no active tab)",
  parameters: { nextjs: { navigation: { pathname: "/account" } } },
};
