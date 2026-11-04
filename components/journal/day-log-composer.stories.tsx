import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { createSearchFixtureFetcher } from "@/stories/fixtures/app-search-demo";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { DayLogComposer } from "./day-log-composer";
import { newDayLogRow, type DaySeed } from "./day-log-entry";

const meta = {
  title: "Components/Journal/Log a day",
  component: DayLogComposer,
  parameters: {
    docs: {
      description: {
        component:
          "Logs several climbs from one day. It opens from an outdoor session's Log additional climbs, starting with that session's climb, date, friends and tags. The date and tagged friends are set once for the day; tags can be set for the whole day or per climb. The day lists one line per climb; each climb's style, notes, tags and, for a first ascent, rating, grade and videos are set in its own dialog, opened on pick and from Edit. Opens fullscreen from the Log popup.",
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

/** What an outdoor session hands over: a flash on Cedar Arete with a note,
 * tagged with Alex and #cold. */
const FROM_SESSION: DaySeed = {
  entryDate: "2026-09-12",
  companions: [FRIENDS[0]],
  tags: ["cold"],
  row: {
    ...newDayLogRow(
      {
        id: -1,
        areaId: -1,
        name: "Cedar Arete",
        type: "boulder",
        grade: 5,
        brokenOn: null,
        areaName: "Cedar Grove",
      },
      false,
      ["cold"],
      [FRIENDS[0]],
    ),
    choice: "flash",
    body: "Flashed it in the shade.",
  },
};

function Example({ seed }: { seed?: DaySeed }) {
  const [climbFetcher] = useState(() => createSearchFixtureFetcher());
  return (
    <StoryPage>
      <div className="max-w-xl">
        <DayLogComposer
          seed={seed}
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

/** Opened from an outdoor session's Log additional climbs: its climb, date,
 * friend and tag are already in the day. */
export const FromSession: Story = { render: () => <Example seed={FROM_SESSION} /> };

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
