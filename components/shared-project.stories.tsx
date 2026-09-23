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
  ownerId: "usr_alex_rivera",
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
  sentOn: null,
  ascentStyle: null,
  rating: null,
  suggestedGrade: null,
  gradeFeel: null,
  sendComment: null,
  sent: false,
};

const sessions: SharedProjectSession[] = [
  {
    id: 4021,
    entryDate: "2026-09-01",
    body: "Heel slipping off the arete. Tried the low start twice and it felt closer.",
    tags: ["beta"],
  },
  {
    id: 3884,
    entryDate: "2026-08-24",
    body: "Skin wrecked after six goes. Held the crux once.",
    tags: [],
  },
  { id: 3610, entryDate: "2026-08-02", body: null, tags: ["warm-up"] },
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
    project: {
      ...project,
      sent: true,
      sentOn: "2026-09-14",
      ascentStyle: "redpoint",
      rating: 4,
      suggestedGrade: 9,
      gradeFeel: "high",
      sendComment: "Went second go of the session. Felt a grade harder than the book says.",
    },
    sessions,
    signedIn: false,
    path: PATH,
  },
  render: (args) => (
    <StoryPage
      title="Shared project"
      description="A project that went. The send travels whole — exact date, rating, suggested grade and comment — because the share dialog names all of it before the link exists."
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
