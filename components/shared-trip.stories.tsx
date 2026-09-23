import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { SharedTrip as SharedTripData, SharedTripEntry, SharedTripSend } from "@/db/queries";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { SharedTrip } from "./shared-trip";

const meta = {
  title: "Components/Shared trip",
  component: SharedTrip,
} satisfies Meta<typeof SharedTrip>;
export default meta;
type Story = StoryObj<typeof meta>;

const PATH = "/trips/4f9c2a7e1b8d6035c9e4a1f7b2d80e36";

const trip: SharedTripData = {
  ownerId: "alex",
  ownerName: "Alex Rivera",
  ownerImage: null,
  tripId: 7,
  name: "Bishop, March 2026",
  description: "Buttermilks and the Happies, with two rest days for the storm.",
  startDate: "2026-03-10",
  endDate: "2026-03-20",
  entryCount: 9,
  sendCount: 3,
  dayCount: 6,
};

const sends: SharedTripSend[] = [
  {
    climbId: 101,
    climbName: "Moon Slab",
    climbType: "boulder",
    climbGrade: 8,
    areaId: 3,
    areaName: "Cedar Block",
    dateSent: "2026-03-18",
    ascentStyle: "redpoint",
    rating: 4,
    suggestedGrade: 9,
    gradeFeel: "high",
    comment: "Held the crux on the last day. Felt a full grade up from the book.",
  },
  {
    climbId: 102,
    climbName: "Warm-up Arete",
    climbType: "boulder",
    climbGrade: 3,
    areaId: 3,
    areaName: "Cedar Block",
    dateSent: "2026-03-12",
    ascentStyle: "flash",
    rating: 3,
    suggestedGrade: 3,
    gradeFeel: "solid",
    comment: null,
  },
];

const entries: SharedTripEntry[] = [
  {
    id: 1,
    kind: "session",
    entryDate: "2026-03-18",
    body: "Held the crux on the last day. Felt a full grade up from the book.",
    tags: ["beta"],
    sent: true,
    climbId: 101,
    climbName: "Moon Slab",
    climbType: "boulder",
    climbGrade: 8,
    areaId: 3,
    areaName: "Cedar Block",
  },
  {
    id: 2,
    kind: "session",
    entryDate: "2026-03-14",
    body: "Skin wrecked after six goes. Closer every time.",
    tags: [],
    sent: false,
    climbId: 101,
    climbName: "Moon Slab",
    climbType: "boulder",
    climbGrade: 8,
    areaId: 3,
    areaName: "Cedar Block",
  },
  {
    id: 3,
    kind: "training",
    entryDate: "2026-03-13",
    body: "Rest day. Hangboard only.",
    tags: ["rest"],
    sent: false,
    climbId: null,
    climbName: null,
    climbType: null,
    climbGrade: null,
    areaId: null,
    areaName: null,
  },
];

export const SignedOut: Story = {
  args: { trip, entries, sends, signedIn: false, path: PATH },
  render: (args) => (
    <StoryPage
      title="Shared trip"
      description="What a link holder sees: one climber, one stretch of dates, and everything they logged inside it — the owner's own view. The sign-up prompt is the only thing asking anything of them."
    >
      <SharedTrip {...args} />
    </StoryPage>
  ),
};

export const SignedIn: Story = {
  args: { trip, entries, sends, signedIn: true, path: PATH },
  render: (args) => (
    <StoryPage
      title="Shared trip"
      description="A member opening the same link. Only the sign-up prompt drops away — a link has no audience, so being signed in changes nothing about access."
    >
      <SharedTrip {...args} />
    </StoryPage>
  ),
};

export const NothingLogged: Story = {
  args: {
    trip: { ...trip, entryCount: 0, sendCount: 0, dayCount: 0 },
    entries: [],
    sends: [],
    signedIn: false,
    path: PATH,
  },
  render: (args) => (
    <StoryPage
      title="Shared trip"
      description="A trip shared before it happened, or one with nothing inside its dates. The window is still the trip; it simply has nothing in it yet."
    >
      <SharedTrip {...args} />
    </StoryPage>
  ),
};
