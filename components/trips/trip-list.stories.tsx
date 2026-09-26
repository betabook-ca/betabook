import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { mocked, userEvent, within } from "storybook/test";

import { deleteTrip } from "@/actions";
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

/** The server refused the delete: the dialog stays open with the reason, so
 * the climber can retry or keep the trip. */
export const DeleteFails: Story = {
  args: { trips: tripSamples },
  beforeEach: () => {
    mocked(deleteTrip).mockResolvedValue({
      ok: false,
      error: "Too many changes — try again in a minute",
    });
    return () => mocked(deleteTrip).mockReset();
  },
  render: (args) => (
    <StoryPage title="Trips">
      <TripList {...args} />
    </StoryPage>
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole("button", { name: "Actions for Squamish, July 2026" }));
    await userEvent.click(await page.findByRole("menuitem", { name: "Delete" }));
    const dialog = within(await page.findByRole("alertdialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await dialog.findByRole("alert");
  },
};
