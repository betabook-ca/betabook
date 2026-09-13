import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ashCrack, moonSlab, riverRoute } from "@/stories/fixtures/open-projects";
import { Example, StoryPage } from "@/stories/fixtures/story-layout";

import { ProjectCard } from "./project-card";

const meta = {
  title: "Components/Journal/Project card",
  component: ProjectCard,
} satisfies Meta<typeof ProjectCard>;
export default meta;
type Story = StoryObj;

// The gallery's clock, so the staleness line is the same in every capture.
const TODAY = "2026-09-06";

export const Project: Story = {
  render: () => (
    <StoryPage
      title="Project card"
      description="The recent sessions are on the card itself. A project with more history than the page preloaded pages the rest in from the journal."
    >
      <Example title="Worked recently, more history to load">
        <ProjectCard
          project={moonSlab}
          userId="storybook-climber"
          today={TODAY}
          onLogSession={() => {}}
        />
      </Example>
      <Example title="Gone cold">
        <ProjectCard
          project={riverRoute}
          userId="storybook-climber"
          today={TODAY}
          onLogSession={() => {}}
        />
      </Example>
      <Example title="Dates only, no notes written">
        <ProjectCard
          project={ashCrack}
          userId="storybook-climber"
          today={TODAY}
          onLogSession={() => {}}
        />
      </Example>
    </StoryPage>
  ),
};
