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
          "Logs several climbs from one day. The date and tagged friends are set once for the day; tags can be set for the whole day or per climb. The day lists one line per climb; each climb's style, notes, tags and, for a first ascent, rating, grade and videos are set in its own dialog, opened on pick and from Edit. Opens fullscreen from the Log popup.",
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

// The picker and each climb's dialog render into the document body, not the canvas.
const body = () => within(document.body);

async function gone(name: string) {
  await waitFor(() => expect(body().queryByRole("dialog", { name })).toBeNull());
}

/** Picks a climb, lets `fill` set its fields in the climb's dialog, and adds it. */
async function addClimb(
  canvas: Canvas,
  result: string,
  fill: (dialog: Canvas) => Promise<void> = async () => {},
) {
  const name = result.split(",")[0];
  await userEvent.click(canvas.getByRole("button", { name: "Add climb" }));
  const picker = within(await body().findByRole("dialog", { name: "Add a climb" }));
  await userEvent.type(picker.getByRole("searchbox", { name: "Choose a climb" }), "cedar");
  await userEvent.click(await picker.findByRole("button", { name: `Choose ${result}` }));
  await gone("Add a climb");
  const dialog = within(await body().findByRole("dialog", { name }));
  await fill(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "Add to day" }));
  await gone(name);
}

export const Empty: Story = { render: () => <Example /> };

/** A first ascent with a video, a repeat and a plain session with a note. */
export const MixedDay: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await addClimb(canvas, "Cedar Crack, North Woods / Upper Wall", async (dialog) => {
      await userEvent.click(dialog.getByRole("radio", { name: "Redpoint" }));
      await userEvent.type(dialog.getByRole("textbox", { name: "Notes" }), "Finally clipped it.");
      await userEvent.type(
        dialog.getByRole("textbox", { name: /Video link/ }),
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      );
    });
    await addClimb(canvas, "Cedar Arete, North Woods / Cedar Grove", async (dialog) => {
      await userEvent.click(dialog.getByRole("radio", { name: "Repeat" }));
    });
    await addClimb(canvas, "Cedar Corner, North Woods / Cedar Grove", async (dialog) => {
      await userEvent.type(dialog.getByRole("textbox", { name: "Notes" }), "Worked the roof.");
    });
  },
};

/** One climb's own dialog, open over the day: a first ascent with its fields. */
export const ClimbDialog: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await addClimb(canvas, "Cedar Crack, North Woods / Upper Wall", async (dialog) => {
      await userEvent.click(dialog.getByRole("radio", { name: "Redpoint" }));
    });
    await userEvent.click(canvas.getByRole("button", { name: "Edit Cedar Crack" }));
    await body().findByRole("dialog", { name: "Cedar Crack" });
  },
};

/** A day tag on every climb, taken off one climb, next to a climb's own tag. */
export const DayAndClimbTags: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await addClimb(canvas, "Cedar Crack, North Woods / Upper Wall");
    await userEvent.type(
      canvas.getByRole("combobox", { name: "Tags for every climb" }),
      "cold{Enter}",
    );
    await addClimb(canvas, "Cedar Corner, North Woods / Cedar Grove", async (dialog) => {
      await userEvent.type(dialog.getByRole("combobox", { name: "Tags" }), "crimpy{Enter}");
    });
    await userEvent.click(canvas.getByRole("button", { name: "Edit Cedar Crack" }));
    const crack = within(await body().findByRole("dialog", { name: "Cedar Crack" }));
    await userEvent.click(crack.getByRole("button", { name: "Remove tag cold" }));
    await userEvent.click(crack.getByRole("button", { name: "Save climb" }));
    await gone("Cedar Crack");
  },
};

export const EmptyDayError: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Save day" }));
  },
};
