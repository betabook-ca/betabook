import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { TripAlbumPhotos } from "@/components/trips/trip-album";
import { TripList } from "@/components/trips/trip-list";
import type { UserSendRow } from "@/db/queries";
import { SHARED_OWNER, SharedProfileFrame } from "@/stories/fixtures/shared-profile-frame";
import { TRIPS_TODAY, tripSamples } from "@/stories/fixtures/trips";

import { SharedTrip } from "./shared-trips";

/** What the journal's audiences decide never reaches a signed-out reader. */
const trips = tripSamples.map((trip) => ({ ...trip, entryCount: null, dayCount: null }));
const PATH = `/users/${SHARED_OWNER.id}/trips/2?share=${SHARED_OWNER.token}`;

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
  component: SharedTrip,
  parameters: {
    fullWidth: true,
    nextjs: { navigation: { pathname: `/users/${SHARED_OWNER.id}/trips/2` } },
  },
  args: {
    owner: SHARED_OWNER,
    trip: { ...trips[1], sendCount: SENDS.length },
    sends: SENDS,
    areaBreadcrumbs: { 11: [{ id: 1, name: "Bishop" }] },
    path: PATH,
    today: TRIPS_TODAY,
  },
  // The frame a member sees round a profile, which the page puts round this.
  decorators: [
    (Story) => (
      <SharedProfileFrame next={PATH}>
        <Story />
      </SharedProfileFrame>
    ),
  ],
} satisfies Meta<typeof SharedTrip>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One trip for the signed-out holder of a profile link: the header a member
 * sees, and the sends inside it. */
export const Trip: Story = {};

export const LongTrip: Story = {
  args: { trip: { ...trips[1], name: "The 2026 season", sendCount: 260 } },
};

export const WithPhotos: Story = {
  args: {
    photos: (
      <TripAlbumPhotos
        link="https://photos.app.goo.gl/Example1Album2Link3"
        photos={[4000, 3000, 6000].map((width, index) => ({
          url: `data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 3000"><rect width="${width}" height="3000" fill="${["#a9c7e8", "#f2c89b", "#cfe3d4"][index]}"/><path d="M0 3000 L${width * 0.4} 1100 L${width * 0.7} 1900 L${width} 1300 L${width} 3000 Z" fill="#7a6a5a"/></svg>`,
          )}#`,
          width,
          height: 3000,
        }))}
      />
    ),
  },
};

/** The Trips tab for the same reader: the list a member sees, read only. */
export const List: Story = {
  parameters: { nextjs: { navigation: { pathname: `/users/${SHARED_OWNER.id}/trips` } } },
  render: () => (
    <TripList
      trips={trips}
      userId={SHARED_OWNER.id}
      today={TRIPS_TODAY}
      canEdit={false}
      shareToken={SHARED_OWNER.token}
    />
  ),
};

export const NoTrips: Story = {
  parameters: List.parameters,
  render: () => (
    <TripList
      trips={[]}
      userId={SHARED_OWNER.id}
      today={TRIPS_TODAY}
      canEdit={false}
      shareToken={SHARED_OWNER.token}
    />
  ),
};
