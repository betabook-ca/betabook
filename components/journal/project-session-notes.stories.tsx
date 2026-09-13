import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ashCrack, moonSlab } from "@/stories/fixtures/open-projects";
import { Example, StoryPage } from "@/stories/fixtures/story-layout";

import { ProjectSessionNotes } from "./project-session-notes";

const meta = {
  title: "Components/Journal/Project sessions",
  component: ProjectSessionNotes,
} satisfies Meta<typeof ProjectSessionNotes>;
export default meta;
type Story = StoryObj;

export const Sessions: Story = {
  render: () => (
    <StoryPage
      title="Project sessions"
      description="A project's sessions, newest first, with whatever the climber wrote that day."
    >
      <Example title="Every session already loaded">
        <ProjectSessionNotes
          userId="storybook-climber"
          climbId={ashCrack.climbId}
          sessionCount={ashCrack.sessions.length}
          initialSessions={ashCrack.sessions}
        />
      </Example>
      <Example title="Older sessions still to page in">
        <ProjectSessionNotes
          userId="storybook-climber"
          climbId={moonSlab.climbId}
          sessionCount={moonSlab.sessionCount}
          initialSessions={moonSlab.sessions}
        />
      </Example>
    </StoryPage>
  ),
};
