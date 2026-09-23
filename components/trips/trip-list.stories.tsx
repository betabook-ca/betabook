import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";
import { TRIPS_TODAY, currentTrip, tripSamples } from "@/stories/fixtures/trips";

import { TripList } from "./trip-list";

const meta = {
  title: "Components/Trips/Trip list",
  component: TripList,
  args: { userId: "alex", today: TRIPS_TODAY },
} satisfies Meta<typeof TripList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { trips: tripSamples },
  render: (args) => (
    <StoryPage
      title="Trips"
      description="The owner's trips, newest window first. Counts come from the same SQL the trip's own tabs read, so a card cannot promise a number the page behind it contradicts."
    >
      <TripList {...args} />
    </StoryPage>
  ),
};

export const WithCurrentTrip: Story = {
  args: { trips: [currentTrip, ...tripSamples] },
  render: (args) => (
    <StoryPage
      title="Trips"
      description="Only two statuses earn a chip. Past is the ordinary case — badging it would mark nearly every card and stop the two that matter from standing out."
    >
      <TripList {...args} />
    </StoryPage>
  ),
};

export const Empty: Story = {
  args: { trips: [] },
  render: (args) => (
    <StoryPage
      title="Trips"
      description="Before the first trip. The empty state says what a trip is for, because nothing on the page demonstrates it yet."
    >
      <TripList {...args} />
    </StoryPage>
  ),
};
