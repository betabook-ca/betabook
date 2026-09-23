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
/** A trip's own page. It nests under /trips, so the Trips tab stays lit
 * while the climber is inside one — the same prefix match that keeps
 * Projects lit on the sent sub-page. */
export const TripDetail: Story = {
  parameters: { nextjs: { navigation: { pathname: "/users/sample/trips/1" } } },
};
export const Progress: Story = {
  args: { area: "progress" },
  parameters: { nextjs: { navigation: { pathname: "/users/sample/projects" } } },
};
/** The sent sub-page. It nests under /projects, so the Projects tab
 * stays lit while the climber is on it. */
export const SentProjects: Story = {
  args: { area: "progress" },
  parameters: { nextjs: { navigation: { pathname: "/users/sample/projects/sent" } } },
};
export const Community: Story = {
  args: { area: "community" },
  parameters: { nextjs: { navigation: { pathname: "/feed" } } },
};
export const Friends: Story = {
  args: { area: "community" },
  parameters: { nextjs: { navigation: { pathname: "/friends" } } },
};
