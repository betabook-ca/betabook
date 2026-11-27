import type { Meta, StoryObj } from "@storybook/react-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { AppTabs, FloatingAppTabBar } from "./app-tab-bar";

const meta = {
  title: "Components/Navigation/Tab bar",
  component: AppTabs,
  parameters: {
    docs: {
      description: {
        component:
          "The selected destination fills the entire rounded tab, including its icon and label, in both themes. Notification counts sit at the upper right of the centered icon with a gap, staying compact and inset from the selected pill. It glides between destinations and changes instantly with reduced motion.",
      },
    },
  },
  args: { account: { id: "sample", name: "Alex Morgan", image: null } },
  decorators: [
    (Story, context) =>
      context.parameters.scrollDemo ? (
        <StoryPage
          title="Scroll-responsive tab bar"
          description="Use a phone-width preview. Scroll down to minimize, then up to restore the labels. All three destinations remain available."
        >
          <Story />
        </StoryPage>
      ) : (
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
  name: "No notifications",
  parameters: { router: { navigation: { pathname: "/users/sample/sends" } } },
};
export const FriendRequests: Story = {
  name: "Community requests",
  args: { requestCount: 12 },
  parameters: { router: { navigation: { pathname: "/friends" } } },
};
export const You: Story = {
  name: "Account settings (no active tab)",
  parameters: { router: { navigation: { pathname: "/account" } } },
};

export const ManyNotifications: Story = {
  name: "Large notification count (99+)",
  args: { requestCount: 120 },
  parameters: { router: { navigation: { pathname: "/feed" } } },
};

export const AllTabsWithNotifications: Story = {
  name: "All tabs · notification badges",
  args: { notificationCounts: { logbook: 2, progress: 5, community: 12 } },
  parameters: { router: { navigation: { pathname: "/users/sample/journal" } } },
};

export const ScrollBehavior: Story = {
  name: "Scroll behavior",
  args: { notificationCounts: { logbook: 2, progress: 5, community: 12 } },
  parameters: {
    scrollDemo: true,
    router: { navigation: { pathname: "/users/sample/journal" } },
  },
  render: (args) => (
    <>
      <div className="flex flex-col">
        {Array.from({ length: 16 }, (_, index) => (
          <section key={index} className="border-b border-separator py-12">
            <h2 className="font-semibold">Climbing session {index + 1}</h2>
            <p className="mt-2 text-muted">
              A few good attempts, a new sequence, and another day outside.
            </p>
          </section>
        ))}
      </div>
      <FloatingAppTabBar {...args} />
    </>
  ),
};
