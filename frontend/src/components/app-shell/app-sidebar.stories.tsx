import { Button } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Menu } from "lucide-react";

import { BrandHomeLink } from "@/components/app-shell/brand";
import { SearchTriggerControl } from "@/components/app-shell/command-palette";
import { MENU_TRIGGER_CLASS } from "@/components/app-shell/nav-link";
import { WorkspaceShell } from "@/components/app-shell/workspace-shell";
import { LogEntryButton } from "@/components/journal/log-entry-button";
import { cardClass } from "@/components/ui/card";
import { PAGE_MAX_WIDTH_CLASS } from "@/components/ui/layout";

import { SidebarLayout } from "./app-sidebar";

const meta = {
  title: "Components/Navigation/Sidebar",
  component: SidebarLayout,
  parameters: {
    fullWidth: true,
    router: { navigation: { pathname: "/feed" } },
    docs: {
      description: {
        component:
          "The viewport sidebar and its page frame respect lateral device safe areas, including notched phones using the desktop layout in landscape. Contained tutorial sidebars retain their local spacing.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="-m-4">
        <Story />
      </div>
    ),
  ],
  args: {
    account: { id: "sample", name: "Alex Morgan", isAdmin: false },
    requestCount: 3,
    children: (
      <div className="flex min-h-dvh flex-col">
        <header className="flex h-14 shrink-0 items-center border-b border-separator px-4">
          <div
            className={`mx-auto grid w-full ${PAGE_MAX_WIDTH_CLASS} grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 md:grid-cols-[minmax(8rem,1fr)_minmax(0,32rem)_minmax(8rem,1fr)] md:gap-4`}
          >
            <div>
              <div className="hidden md:block">
                <BrandHomeLink />
              </div>
              <Button
                isIconOnly
                variant="ghost"
                className={`size-11 md:hidden ${MENU_TRIGGER_CLASS}`}
                aria-label="Open menu"
              >
                <Menu aria-hidden className="size-5" />
              </Button>
            </div>
            <SearchTriggerControl />
            <div className="flex min-w-11 justify-end">
              <LogEntryButton className="h-11 px-3 md:h-10 md:px-4" />
            </div>
          </div>
        </header>
        <div className="flex flex-col gap-6 px-4 py-5 md:py-6" data-sidebar-content>
          <WorkspaceShell area="community" userId="sample">
            <div className={cardClass("fluid")}>
              <h2 className="text-lg font-semibold">A day at the crag</h2>
              <p className="mt-2 text-sm text-muted">
                New sends, familiar projects, and a few good attempts.
              </p>
            </div>
          </WorkspaceShell>
        </div>
      </div>
    ),
  },
} satisfies Meta<typeof SidebarLayout>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Member: Story = {};
export const Moderator: Story = {
  args: { account: { id: "sample", name: "Alex Morgan", isAdmin: true } },
};
export const SignedOut: Story = { args: { account: null } };
export const Loading: Story = { args: { account: undefined } };
