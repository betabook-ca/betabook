import type { Meta, StoryObj } from "@storybook/react-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { AppTabs } from "./app-tab-bar";

const meta = {
  title: "Components/Navigation/Tab bar",
  component: AppTabs,
  parameters: {
    docs: {
      description: {
        component:
          "The selected destination fills the entire rounded tab, including its icon and label, in both themes. It glides between destinations and changes instantly with reduced motion.",
      },
    },
  },
  args: { account: { id: "sample", name: "Alex Morgan", image: null } },
  decorators: [
    (Story) => (
      <StoryPage title="Phone tab bar">
        <nav aria-label="Primary" className="app-tab-bar-surface w-full max-w-md">
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
  parameters: { router: { navigation: { pathname: "/users/sample/sends" } } },
};
export const Feed: Story = {
  name: "Community",
  parameters: { router: { navigation: { pathname: "/feed" } } },
};
export const FriendRequests: Story = {
  args: { requestCount: 12 },
  parameters: { router: { navigation: { pathname: "/friends" } } },
};
export const Progress: Story = {
  parameters: { router: { navigation: { pathname: "/users/sample/projects" } } },
};
export const You: Story = {
  name: "Account settings (no active tab)",
  parameters: { router: { navigation: { pathname: "/account" } } },
};
