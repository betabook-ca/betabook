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
      description="The climber's trips, most recent first. Each card carries what that trip came to: days logged, entries and sends."
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
      description="Before the first trip. The empty state carries the explanation, because nothing on the page demonstrates it yet — and the only New trip button, so there are never two on one screen."
    >
      <TripList {...args} />
    </StoryPage>
  ),
};
