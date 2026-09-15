import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { BrandHomeLink } from "@/components/brand";
import { cardClass } from "@/components/ui/card";
import { WorkspaceShell } from "@/components/workspace-shell";

import { SidebarLayout } from "./app-sidebar";

const meta = {
  title: "Components/Navigation/Sidebar",
  component: SidebarLayout,
  parameters: { fullWidth: true, nextjs: { navigation: { pathname: "/feed" } } },
  args: {
    account: { id: "sample", name: "Alex Morgan", isAdmin: false },
    requestCount: 3,
    children: (
      <div className="flex min-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex h-14 shrink-0 items-center px-4">
          <BrandHomeLink />
        </header>
        <div className="flex flex-col gap-6 p-4" data-sidebar-content>
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
