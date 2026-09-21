import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { SharedProject as SharedProjectData, SharedProjectSession } from "@/db/queries";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { SharedProject } from "./shared-project";

const meta = {
  title: "Components/Shared project",
  component: SharedProject,
} satisfies Meta<typeof SharedProject>;
export default meta;
type Story = StoryObj<typeof meta>;

const PATH = "/projects/4f9c2a7e1b8d6035c9e4a1f7b2d80e36";

const project: SharedProjectData = {
  ownerName: "Alex Rivera",
  ownerImage: null,
  climbId: 101,
  climbName: "Moon Slab",
  climbType: "boulder",
  climbGrade: 8,
  climbBrokenOn: null,
  areaId: 3,
  areaName: "Cedar Block",
  pinnedAt: "2026-03-02",
  sessionCount: 9,
  firstSession: "2026-03-02",
  lastSession: "2026-09-01",
  sentMonth: null,
  sent: false,
};

const sessions: SharedProjectSession[] = [
  {
    entryDate: "2026-09-01",
    body: "Heel slipping off the arete. Tried the low start twice and it felt closer.",
    tags: ["beta"],
  },
  { entryDate: "2026-08-24", body: "Skin wrecked after six goes. Held the crux once.", tags: [] },
  { entryDate: "2026-08-02", body: null, tags: ["warm-up"] },
];

export const SignedOut: Story = {
  args: { project, sessions, signedIn: false, path: PATH },
  render: (args) => (
    <StoryPage
      title="Shared project"
      description="What a link holder sees: one climber, one climb, and the work behind it. The sign-up prompt is the only thing asking anything of them."
    >
      <SharedProject {...args} />
    </StoryPage>
  ),
};

export const SignedIn: Story = {
  args: { project, sessions, signedIn: true, path: PATH },
  render: (args) => (
    <StoryPage
      title="Shared project"
      description="A member opening the same link. Only the sign-up prompt drops away — a link has no audience, so being signed in changes nothing about access."
    >
      <SharedProject {...args} />
    </StoryPage>
  ),
};

export const Sent: Story = {
  args: {
    project: { ...project, sent: true, sentMonth: "2026-09" },
    sessions,
    signedIn: false,
    path: PATH,
  },
  render: (args) => (
    <StoryPage
      title="Shared project"
      description="A project that went. The send is dated to the month, matching what a signed-out climb page already shows, so the climber cannot be picked out of that list by date."
    >
      <SharedProject {...args} />
    </StoryPage>
  ),
};

export const NoSessionsYet: Story = {
  args: {
    project: { ...project, sessionCount: 0, firstSession: null, lastSession: null },
    sessions: [],
    signedIn: false,
    path: PATH,
  },
  render: (args) => (
    <StoryPage
      title="Shared project"
      description="A climb tracked but never touched. Membership comes from the pin alone, so this is a real state a link can be made for."
    >
      <SharedProject {...args} />
    </StoryPage>
  ),
};
