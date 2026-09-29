import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { UserSendRow } from "@/db/queries";
import { TRIPS_TODAY, tripSamples } from "@/stories/fixtures/trips";

import { SharedTrip, SharedTrips } from "./shared-trips";

const OWNER = {
  id: "alex",
  name: "Alex Rivera",
  image: null,
  token: "4f9c2a7e1b8d6035c9e4a1f7b2d80e36",
};

/** What the journal's audiences decide never reaches a signed-out reader. */
const trips = tripSamples.map((trip) => ({ ...trip, entryCount: null, dayCount: null }));

const SENDS: UserSendRow[] = [
  {
    id: 1,
    climbId: 101,
    climbName: "Moon Slab",
    climbType: "boulder",
    climbGrade: 8,
    areaId: 11,
    areaName: "Cedar Block",
    ascentStyle: "redpoint",
    dateSent: "2026-03-18",
    rating: 4,
    suggestedGrade: 9,
    gradeFeel: "high",
    comment: "Held the crux on the last day.",
  },
  {
    id: 2,
    climbId: 102,
    climbName: "Warm-up Arete",
    climbType: "boulder",
    climbGrade: 3,
    areaId: 11,
    areaName: "Cedar Block",
    ascentStyle: "flash",
    dateSent: "2026-03-12",
    rating: 3,
    suggestedGrade: null,
    gradeFeel: "solid",
    comment: null,
  },
];

const meta = {
  title: "Components/Trips/Shared trips",
  component: SharedTrips,
  parameters: { fullWidth: true },
  args: { owner: OWNER, trips, today: TRIPS_TODAY },
} satisfies Meta<typeof SharedTrips>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A climber's trips for the signed-out holder of their profile link. */
export const List: Story = {};

export const NoTrips: Story = { args: { trips: [] } };

/** One trip for the same reader: what it was and the sends inside it. */
export const Trip: Story = {
  render: () => (
    <SharedTrip
      owner={OWNER}
      trip={{ ...trips[1], sendCount: SENDS.length }}
      sends={SENDS}
      areaBreadcrumbs={{ 11: [{ id: 1, name: "Bishop" }] }}
      path="/users/alex/trips/2?share=4f9c2a7e1b8d6035c9e4a1f7b2d80e36"
      today={TRIPS_TODAY}
    />
  ),
};

export const LongTrip: Story = {
  render: () => (
    <SharedTrip
      owner={OWNER}
      trip={{ ...trips[1], name: "The 2026 season", sendCount: 260 }}
      sends={SENDS}
      areaBreadcrumbs={{ 11: [{ id: 1, name: "Bishop" }] }}
      path="/users/alex/trips/2?share=4f9c2a7e1b8d6035c9e4a1f7b2d80e36"
      today={TRIPS_TODAY}
    />
  ),
};
