import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { NavLink } from "./nav-link";
import { PrimaryPageLinks } from "./primary-page-links";

const meta = {
  title: "Components/Navigation/Primary page links",
  component: PrimaryPageLinks,
  args: { userId: "sample" },
  decorators: [
    (Story, context) => (
      <StoryPage title={context.args.direction === "col" ? "Side menu" : "Top-right navigation"}>
        <nav
          aria-label="Primary"
          className={
            context.args.direction === "col"
              ? "flex w-full flex-col gap-2 text-sm"
              : "flex flex-wrap items-center gap-2 text-sm"
          }
        >
          <Story />
          {context.args.direction === "col" && (
            <NavLink href="/account" appearance="primary" layout="menu">
              Account settings
            </NavLink>
          )}
        </nav>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof PrimaryPageLinks>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MyJournal: Story = {
  name: "My profile",
  parameters: { nextjs: { navigation: { pathname: "/users/sample" } } },
};
export const AddClimb: Story = {
  parameters: { nextjs: { navigation: { pathname: "/climbs/new" } } },
};
export const AddArea: Story = {
  parameters: { nextjs: { navigation: { pathname: "/areas/new" } } },
};
export const Feed: Story = {
  parameters: { nextjs: { navigation: { pathname: "/feed" } } },
};
export const OtherClimber: Story = {
  parameters: { nextjs: { navigation: { pathname: "/users/other/journal" } } },
};

export const SideMenu: Story = {
  args: { direction: "col" },
  parameters: { nextjs: { navigation: { pathname: "/users/sample" } } },
};

export const SideMenuAccount: Story = {
  args: { direction: "col" },
  parameters: { nextjs: { navigation: { pathname: "/account" } } },
};
