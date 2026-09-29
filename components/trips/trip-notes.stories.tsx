import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { mocked, userEvent, within } from "storybook/test";

import { saveTripNotes } from "@/actions";
import { Markdown } from "@/components/ui/markdown";
import { StoryPage } from "@/stories/fixtures/story-layout";
import { TRIP_NOTES } from "@/stories/fixtures/trips";

import { TripNotes } from "./trip-notes";

const meta = {
  title: "Components/Trips/Trip notes",
  component: TripNotes,
  args: {
    tripId: 2,
    notes: TRIP_NOTES,
    canEdit: true,
    children: <Markdown>{TRIP_NOTES}</Markdown>,
  },
  decorators: [
    (Story) => (
      <StoryPage title="Trips">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof TripNotes>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Reading: Story = {};

export const Empty: Story = { args: { notes: null, children: null } };

/** Someone who can read the climber's journal: the notes, and nothing to edit. */
export const Visitor: Story = { args: { canEdit: false } };

/** The editor is a dialog, which renders outside the canvas. */
async function openEditor(canvasElement: HTMLElement) {
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Edit" }));
  return within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));
}

export const Editing: Story = {
  play: async ({ canvasElement }) => {
    await openEditor(canvasElement);
  },
};

export const Previewing: Story = {
  play: async ({ canvasElement }) => {
    const editor = await openEditor(canvasElement);
    await userEvent.click(editor.getByRole("button", { name: "Preview" }));
    await editor.findByRole("heading", { name: "Highlights" });
  },
};

/** A refused save keeps the draft and shows the server's own sentence. */
export const SaveFails: Story = {
  beforeEach: () => {
    mocked(saveTripNotes).mockResolvedValue({
      ok: false,
      error: "Too many changes — try again in a minute",
    });
    return () => mocked(saveTripNotes).mockReset();
  },
  play: async ({ canvasElement }) => {
    const editor = await openEditor(canvasElement);
    await userEvent.click(editor.getByRole("button", { name: "Save notes" }));
    await editor.findByRole("alert");
  },
};
