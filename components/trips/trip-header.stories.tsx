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

/** The owner's view. */
export const Owner: Story = {};

/** A single day reads as one date, and no description drops the line. */
export const SingleDay: Story = { args: { trip: tripSamples[2] } };

/** An upcoming trip with nothing logged. */
export const Upcoming: Story = { args: { trip: tripSamples[0] } };
export const OnNow: Story = { args: { trip: currentTrip } };

export const WithFriends: Story = { args: { trip: tripWithFriends } };

/** A tagged friend viewing the trip. They can remove their own tag. */
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

/** A viewer who can see sends but not the journal: no journal counts or tagged
 * friends. */
export const SendsOnly: Story = {
  args: {
    viewerId: "sam",
    shareUrl: undefined,
    trip: { ...tripSamples[1], entryCount: null, dayCount: null },
  },
};

/** Signed out with a share link. Counts are plain text. */
export const SignedOut: Story = {
  args: {
    viewerId: null,
    shareUrl: undefined,
    share: "4f9c2a7e1b8d6035c9e4a1f7b2d80e36",
    trip: { ...tripSamples[1], entryCount: null, dayCount: null },
  },
};

/** On the analytics page, with a link back to the trip. */
export const OverAnalytics: Story = { args: { back: "trip", shareUrl: undefined } };
