import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cardClass } from "@/components/ui/card";
import { StoryPage } from "@/stories/fixtures/story-layout";
import { TRIPS_TODAY, currentTrip, tripSamples, tripWithFriends } from "@/stories/fixtures/trips";

import { TripHeader } from "./trip-header";

const meta = {
  title: "Components/Trips/Trip header",
  component: TripHeader,
  args: {
    trip: tripSamples[1],
    userId: "alex",
    viewerId: "alex",
    today: TRIPS_TODAY,
    current: "journal",
    journalVisible: true,
    children: (
      <div className={cardClass("fluid")}>
        <p className="text-sm text-muted">The current tab's view sits here.</p>
      </div>
    ),
  },
  decorators: [
    (Story) => (
      <StoryPage title="Trips">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof TripHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The trip's own page: the way back, the dates every tab derives from, and
 * its views as pills. */
export const Journal: Story = {};
export const Sends: Story = { args: { current: "sends" } };
export const Analytics: Story = { args: { current: "analytics" } };
export const Notes: Story = { args: { current: "notes" } };

/** A single day reads as one date, and no description drops the line. */
export const SingleDay: Story = { args: { trip: tripSamples[2] } };

export const Upcoming: Story = { args: { trip: tripSamples[0] } };
export const OnNow: Story = { args: { trip: currentTrip } };

export const WithFriends: Story = { args: { trip: tripWithFriends } };

/** One of the tagged friends reading the trip, who can take their own tag off. */
export const TaggedFriend: Story = {
  args: {
    viewerId: "priya",
    trip: {
      ...tripWithFriends,
      companions: tripWithFriends.companions.map((friend) => ({
        ...friend,
        isSelf: friend.id === "priya",
      })),
    },
  },
};

/** Someone who can read the climber's journal. Notes appears because this
 * trip has some; without any, the tab would open onto nothing. */
export const JournalReader: Story = {
  args: { viewerId: "sam", trip: { ...tripSamples[1], hasNotes: 1 } },
};

/** Someone who can see the climber's sends but not their journal: the trip
 * opens on its sends, with no Journal or Notes and no journal counts. */
export const SendsOnly: Story = {
  args: {
    viewerId: "sam",
    current: "sends",
    journalVisible: false,
    trip: { ...tripSamples[1], entryCount: null, dayCount: null },
  },
};
