import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cardClass } from "@/components/ui/card";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { AppMenuLinks } from "./app-menu-links";

const account = { id: "sample", name: "Alex Morgan", image: null, isAdmin: false };

const meta = {
  title: "Components/Navigation/App menu",
  component: AppMenuLinks,
  args: { account },
  decorators: [
    (Story) => (
      <StoryPage title="Menu">
        <nav aria-label="Menu" className={`${cardClass("md")} w-full max-w-xs`}>
          <Story />
        </nav>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof AppMenuLinks>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Profile: Story = {
  name: "Primary fallback",
  parameters: { nextjs: { navigation: { pathname: "/users/sample/sends" } } },
};
export const FriendRequests: Story = {
  args: { requestCount: 3 },
  parameters: { nextjs: { navigation: { pathname: "/friends" } } },
};
export const Moderator: Story = {
  args: { account: { ...account, isAdmin: true }, canInstall: true },
  parameters: { nextjs: { navigation: { pathname: "/admin/requests" } } },
};
export const SignedOut: Story = {
  args: { account: null, canInstall: true },
  parameters: { nextjs: { navigation: { pathname: "/about" } } },
};
export const SecondaryTools: Story = {
  args: { showPrimary: false },
  parameters: { nextjs: { navigation: { pathname: "/account" } } },
};
