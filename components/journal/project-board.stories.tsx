import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { openProjects, sentProjects, sharedProjects } from "@/stories/fixtures/open-projects";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ProjectBoard } from "./project-board";

const meta = {
  title: "Components/Journal/Project board",
  component: ProjectBoard,
  // Every story shares one origin so the copyable link in the share dialog
  // reads like the real one rather than "undefined/projects/…".
  args: { shareOrigin: "https://betabook.ca" },
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

export const SharedProject: Story = {
  args: { userId: "storybook-climber", projects: sharedProjects, hasMore: false },
  render: (args) => (
    <StoryPage
      title="Projects"
      description="A project with a live link beside one without: the control reads as state, not just an action."
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
