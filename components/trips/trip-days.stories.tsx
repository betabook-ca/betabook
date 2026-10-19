import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { JournalEntry, UserSendRow } from "@/db/queries";
import { groupTripDays } from "@/lib/trip-days";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { TripDays } from "./trip-days";

const START = "2026-03-10";

function send(id: number, climbId: number, climbName: string, dateSent: string): UserSendRow {
  return {
    id,
    climbId,
    climbName,
    climbType: "boulder",
    climbGrade: climbId === 101 ? 8 : 3,
    areaId: 11,
    areaName: "Cedar Block",
    ascentStyle: climbId === 101 ? "redpoint" : "flash",
    dateSent,
    rating: 4,
    suggestedGrade: null,
    gradeFeel: "solid",
    comment: climbId === 101 ? "Held the crux on the last day." : null,
    videos: null,
  };
}

function entry(id: number, props: Partial<JournalEntry> & { entryDate: string }): JournalEntry {
  return {
    id,
    climbId: 101,
    kind: "session",
    sent: false,
    body: null,
    tags: [],
    climbName: "Moon Slab",
    climbType: "boulder",
    climbGrade: 8,
    climbBrokenOn: null,
    areaId: 11,
    areaName: "Cedar Block",
    isAscent: false,
    isSendComment: false,
    ...props,
  };
}

const SENDS = [
  send(1, 102, "Warm-up Arete", "2026-03-12"),
  send(2, 101, "Moon Slab", "2026-03-18"),
];

const ENTRIES = [
  entry(10, { entryDate: "2026-03-10", body: "Fell off the top twice. Feet keep cutting." }),
  entry(11, {
    entryDate: "2026-03-12",
    climbId: 102,
    climbName: "Warm-up Arete",
    climbGrade: 3,
    sent: true,
    isAscent: true,
  }),
  entry(12, { entryDate: "2026-03-12", body: "Linked the first half." }),
  entry(13, {
    entryDate: "2026-03-14",
    kind: "training",
    climbId: null,
    climbName: null,
    climbType: null,
    climbGrade: null,
    areaId: null,
    areaName: null,
    body: "Rest day hangs.",
  }),
  // The ascent entry duplicates the send, so the send row replaces it.
  entry(14, { entryDate: "2026-03-18", sent: true, isAscent: true }),
];

const meta = {
  title: "Components/Trips/Trip days",
  component: TripDays,
  args: {
    heading: "Days",
    days: groupTripDays({ startDate: START, sends: SENDS, entries: ENTRIES }).days,
    areaBreadcrumbs: {},
    userId: "sample",
    isOwner: true,
    emptyMessage: "Nothing logged on this trip yet.",
  },
  decorators: [
    (Story) => (
      <StoryPage title="Trip days">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof TripDays>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A reader of the journal sees sessions and training between the sends. */
export const WithJournal: Story = {};

/** Without journal access, only the days with a send are listed. */
export const SendsOnly: Story = {
  args: {
    days: groupTripDays({ startDate: START, sends: SENDS, entries: [] }).days,
    isOwner: false,
    emptyMessage: "No sends on this trip yet.",
  },
};

export const Empty: Story = { args: { days: [] } };
