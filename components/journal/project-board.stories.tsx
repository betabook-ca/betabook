import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { openProjects } from "@/stories/fixtures/open-projects";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ProjectBoard } from "./project-board";

const meta = {
  title: "Components/Journal/Project board",
  component: ProjectBoard,
} satisfies Meta<typeof ProjectBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Projects: Story = {
  args: { userId: "storybook-climber", projects: openProjects, hasMore: false },
  render: (args) => (
    <StoryPage title="Projects" description="Open projects with their recent sessions.">
      <ProjectBoard {...args} />
    </StoryPage>
  ),
};

export const MoreThanOnePage: Story = {
  args: { userId: "storybook-climber", projects: openProjects, hasMore: true },
  render: (args) => (
    <StoryPage title="Projects" description="More open projects than one page holds.">
      <ProjectBoard {...args} />
    </StoryPage>
  ),
};

export const NoProjects: Story = {
  args: { userId: "storybook-climber", projects: [], hasMore: false },
  render: (args) => (
    <StoryPage title="Projects" description="No open projects.">
      <ProjectBoard {...args} />
    </StoryPage>
  ),
};
