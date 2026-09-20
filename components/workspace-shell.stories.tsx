import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cardClass } from "@/components/ui/card";

import { WorkspaceShell } from "./workspace-shell";

const meta = {
  title: "Components/Navigation/Workspace",
  component: WorkspaceShell,
  args: {
    area: "logbook",
    userId: "sample",
    children: (
      <div className={cardClass("fluid")}>
        <h2 className="text-lg font-semibold">Recent sessions</h2>
        <p className="mt-2 text-sm text-muted">Your climbing, one day at a time.</p>
      </div>
    ),
  },
  parameters: { nextjs: { navigation: { pathname: "/users/sample/journal" } } },
} satisfies Meta<typeof WorkspaceShell>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Logbook: Story = {};
export const Sends: Story = {
  parameters: { nextjs: { navigation: { pathname: "/users/sample/sends" } } },
};
export const Progress: Story = {
  args: { area: "progress" },
  parameters: { nextjs: { navigation: { pathname: "/users/sample/projects" } } },
};
/** The sibling tab. Its pathname must leave Projects un-highlighted —
 * a nested /projects/sent would mark both current. */
export const SentProjects: Story = {
  args: { area: "progress" },
  parameters: { nextjs: { navigation: { pathname: "/users/sample/sent-projects" } } },
};
export const Community: Story = {
  args: { area: "community" },
  parameters: { nextjs: { navigation: { pathname: "/feed" } } },
};
export const Friends: Story = {
  args: { area: "community" },
  parameters: { nextjs: { navigation: { pathname: "/friends" } } },
};
