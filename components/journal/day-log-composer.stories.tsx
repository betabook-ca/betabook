import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { createSearchFixtureFetcher } from "@/stories/fixtures/app-search-demo";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { DayLogComposer } from "./day-log-composer";

const meta = {
  title: "Components/Journal/Log a day",
  component: DayLogComposer,
  parameters: {
    docs: {
      description: {
        component:
          "Logs several climbs from one day. The date and tagged friends are set once for the day; tags can be set for the whole day or per climb; each climb keeps its own style, notes and, for a first ascent, rating, grade and videos. Opens fullscreen from the Log popup.",
      },
    },
  },
} satisfies Meta<typeof DayLogComposer>;
export default meta;
type Story = StoryObj;

const FRIENDS = [
  { id: "alex", name: "Alex Rivera", image: null },
  { id: "sam", name: "Sam Okafor", image: null },
];

function Example() {
  const [climbFetcher] = useState(() => createSearchFixtureFetcher());
  return (
    <StoryPage>
      <div className="max-w-xl">
        <DayLogComposer
          today="2026-09-12"
          onBack={() => {}}
          onDone={() => {}}
          onSave={async () => ({ ok: true, value: undefined })}
          climbFetcher={climbFetcher}
          companionFetcher={async (query) =>
            FRIENDS.filter((friend) => friend.name.toLowerCase().includes(query.toLowerCase()))
          }
        />
      </div>
    </StoryPage>
  );
}

type Canvas = ReturnType<typeof within>;

async function addClimb(canvas: Canvas, name: string) {
  await userEvent.click(canvas.getByRole("button", { name: "Add climb" }));
  // The picker is a dialog, rendered into the document body rather than the canvas.
  const picker = within(await within(document.body).findByRole("dialog", { name: "Add a climb" }));
  await userEvent.type(picker.getByRole("searchbox", { name: "Choose a climb" }), "cedar");
  await userEvent.click(await picker.findByRole("button", { name: `Choose ${name}` }));
  await waitFor(() =>
    expect(within(document.body).queryByRole("dialog", { name: "Add a climb" })).toBeNull(),
  );
}

export const Empty: Story = { render: () => <Example /> };

/** A first ascent with a video, a repeat and a plain session. */
export const MixedDay: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await addClimb(canvas, "Cedar Crack, North Woods / Upper Wall");
    await addClimb(canvas, "Cedar Arete, North Woods / Cedar Grove");
    await addClimb(canvas, "Cedar Corner, North Woods / Cedar Grove");
    const crack = canvas.getByRole("listitem", { name: "Cedar Crack" });
    await userEvent.click(within(crack).getByRole("radio", { name: "Redpoint" }));
    await userEvent.click(within(crack).getByRole("button", { name: "Add details" }));
    await userEvent.type(
      within(crack).getByRole("textbox", { name: /Video link/ }),
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    const arete = canvas.getByRole("listitem", { name: "Cedar Arete" });
    await userEvent.click(within(arete).getByRole("radio", { name: "Repeat" }));
  },
};

/** A day tag on every climb, taken off one climb, next to a climb's own tag. */
export const DayAndClimbTags: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await addClimb(canvas, "Cedar Crack, North Woods / Upper Wall");
    await addClimb(canvas, "Cedar Corner, North Woods / Cedar Grove");
    await userEvent.type(
      canvas.getByRole("combobox", { name: "Tags for every climb" }),
      "cold{Enter}",
    );
    const crack = canvas.getByRole("listitem", { name: "Cedar Crack" });
    await userEvent.click(within(crack).getByRole("button", { name: "Add details" }));
    await userEvent.click(within(crack).getByRole("button", { name: "Remove tag cold" }));
    const corner = canvas.getByRole("listitem", { name: "Cedar Corner" });
    await userEvent.click(within(corner).getByRole("button", { name: "Add details" }));
    await userEvent.type(within(corner).getByRole("combobox", { name: "Tags" }), "crimpy{Enter}");
  },
};

export const EmptyDayError: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Save day" }));
  },
};
