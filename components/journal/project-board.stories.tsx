import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { openProjects, sentProjects } from "@/stories/fixtures/open-projects";
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
    <StoryPage title="Projects" description="Tracked projects with their recent sessions.">
      <ProjectBoard {...args} />
    </StoryPage>
  ),
};

export const MoreThanOnePage: Story = {
  args: { userId: "storybook-climber", projects: openProjects, hasMore: true },
  render: (args) => (
    <StoryPage title="Projects" description="More tracked projects than one page holds.">
      <ProjectBoard {...args} />
    </StoryPage>
  ),
};

export const NoProjects: Story = {
  args: { userId: "storybook-climber", projects: [], hasMore: false },
  render: (args) => (
    <StoryPage
      title="Projects"
      description="Nothing tracked yet — the starting state, where the track control is the only way forward."
    >
      <ProjectBoard {...args} />
    </StoryPage>
  ),
};

export const SentProjects: Story = {
  args: {
    userId: "storybook-climber",
    projects: sentProjects,
    hasMore: false,
    variant: "sent",
  },
  render: (args) => (
    <StoryPage
      title="Sent projects"
      description="Where a tracked climb goes once it is sent, instead of disappearing."
    >
      <ProjectBoard {...args} />
    </StoryPage>
  ),
};

export const NoSentProjects: Story = {
  args: { userId: "storybook-climber", projects: [], hasMore: false, variant: "sent" },
  render: (args) => (
    <StoryPage title="Sent projects" description="Nothing sent yet.">
      <ProjectBoard {...args} />
    </StoryPage>
  ),
};
