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
    shareUrl: "https://betabook.ca/users/alex/trips/2?share=4f9c2a7e1b8d6035c9e4a1f7b2d80e36",
    today: TRIPS_TODAY,
    children: (
      <div className={cardClass("fluid")}>
        <p className="text-sm text-muted">The trip's album, notes and sends sit here.</p>
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

/** The trip's own page, as its owner: the way back, what it holds, each
 * count opening the Journal or Sends under the trip's dates, and the way to
 * share it. */
export const Owner: Story = {};

/** A single day reads as one date, and no description drops the line. */
export const SingleDay: Story = { args: { trip: tripSamples[2] } };

/** Still to come, so there is nothing to count yet. */
export const Upcoming: Story = { args: { trip: tripSamples[0] } };
export const OnNow: Story = { args: { trip: currentTrip } };

export const WithFriends: Story = { args: { trip: tripWithFriends } };

/** One of the tagged friends reading the trip, who can take their own tag off. */
export const TaggedFriend: Story = {
  args: {
    viewerId: "priya",
    shareUrl: undefined,
    trip: {
      ...tripWithFriends,
      companions: tripWithFriends.companions.map((friend) => ({
        ...friend,
        isSelf: friend.id === "priya",
      })),
    },
  },
};

/** Someone who can see the climber's sends but not their journal: no journal
 * counts and no tagged friends. */
export const SendsOnly: Story = {
  args: {
    viewerId: "sam",
    shareUrl: undefined,
    trip: { ...tripSamples[1], entryCount: null, dayCount: null },
  },
};

/** Signed out, holding the climber's profile link: the counts are stated and
 * not linked, since the Logbook is behind sign-in. */
export const SignedOut: Story = {
  args: {
    viewerId: null,
    shareUrl: undefined,
    share: "4f9c2a7e1b8d6035c9e4a1f7b2d80e36",
    trip: { ...tripSamples[1], entryCount: null, dayCount: null },
  },
};

/** Over the trip's analytics, which lead back to the trip. */
export const OverAnalytics: Story = { args: { back: "trip", shareUrl: undefined } };
