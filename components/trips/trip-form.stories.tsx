import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { SURFACE_CARD_CLASS } from "@/components/ui/card";
import { StoryPage } from "@/stories/fixtures/story-layout";
import { findTripFriends, tripFriends } from "@/stories/fixtures/trips";

import { EMPTY_TRIP_DRAFT, TripForm, type TripDraft } from "./trip-form";

const meta = {
  title: "Components/Trips/Trip form",
  component: TripForm,
} satisfies Meta<typeof TripForm>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The form is controlled, so the sample owns the draft — typing in the story
 * behaves the way it does in the dialog. */
function Editable({
  initial,
  error,
  editing = false,
}: {
  initial: TripDraft;
  error?: string;
  editing?: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const datesBackwards =
    Boolean(draft.startDate) && Boolean(draft.endDate) && draft.endDate < draft.startDate;
  return (
    <div className={SURFACE_CARD_CLASS}>
      <TripForm
        draft={draft}
        onChange={setDraft}
        error={error}
        dateError={datesBackwards ? "End date must be on or after start date." : null}
        editing={editing}
        companionFetcher={findTripFriends}
      />
    </div>
  );
}

export const Empty: Story = {
  args: { draft: EMPTY_TRIP_DRAFT, onChange: () => {} },
  render: () => (
    <StoryPage
      title="New trip"
      description="Neither date is capped at today: a trip is often booked before it is climbed, so the picker has to accept the future."
    >
      <Editable initial={EMPTY_TRIP_DRAFT} />
    </StoryPage>
  ),
};

const BISHOP: TripDraft = {
  name: "Bishop, March 2026",
  description: "Buttermilks and the Happies.",
  albumUrl: "https://photos.app.goo.gl/Example1Album2Link3",
  startDate: "2026-03-10",
  endDate: "2026-03-20",
  companions: [],
};

export const Filled: Story = {
  args: { draft: BISHOP, onChange: () => {} },
  render: () => (
    <StoryPage title="Edit trip" description="Editing moves the window. Nothing is reassigned.">
      <Editable initial={BISHOP} />
    </StoryPage>
  ),
};

/** Friends already tagged on a trip being edited. Type S, P or J to find more. */
export const WithFriends: Story = {
  args: { draft: BISHOP, onChange: () => {} },
  render: () => (
    <StoryPage title="Edit trip">
      <Editable initial={{ ...BISHOP, companions: tripFriends.slice(0, 2) }} editing />
    </StoryPage>
  ),
};

export const BackwardsRange: Story = {
  args: { draft: BISHOP, onChange: () => {} },
  render: () => (
    <StoryPage
      title="Edit trip"
      description="The range is caught before the round trip, under the field that is wrong rather than at the top of the dialog."
    >
      <Editable initial={{ ...BISHOP, startDate: "2026-03-20", endDate: "2026-03-10" }} />
    </StoryPage>
  ),
};

export const ServerError: Story = {
  args: { draft: BISHOP, onChange: () => {} },
  render: () => (
    <StoryPage
      title="Edit trip"
      description="A refused save keeps everything typed, and shows the server's own sentence rather than a re-worded one."
    >
      <Editable initial={BISHOP} error="Trip not found" />
    </StoryPage>
  ),
};
