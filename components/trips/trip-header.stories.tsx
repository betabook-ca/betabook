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
    ownerShare: { share: null, origin: "https://betabook.ca", isPrivate: false },
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
    ownerShare: undefined,
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
    ownerShare: undefined,
    trip: { ...tripSamples[1], entryCount: null, dayCount: null },
  },
};

/** The owner with a live trip link: the button reads Shared. */
export const OwnerShared: Story = {
  args: {
    ownerShare: {
      share: { token: "8c1d3e5f7a9b0c2d4e6f8a0b1c3d5e7f", expiresAt: "2026-11-18 00:00:00" },
      origin: "https://betabook.ca",
      isPrivate: false,
    },
  },
};

/** Opened with the trip's own link, signed in or not: no controls, no back
 * link, and the counts are plain text apart from the analytics link. Tagged
 * friends never travel with the link. */
export const TripLink: Story = {
  args: {
    viewerId: null,
    ownerShare: undefined,
    link: "8c1d3e5f7a9b0c2d4e6f8a0b1c3d5e7f",
    trip: { ...tripSamples[1], companions: [] },
  },
};

/** On the analytics page, with a link back to the trip. */
export const OverAnalytics: Story = { args: { back: "trip", ownerShare: undefined } };
