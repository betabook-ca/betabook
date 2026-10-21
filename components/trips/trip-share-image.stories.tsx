import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";

import type { AnalyticsCardId } from "@/lib/analytics-layout";
import { StoryPage } from "@/stories/fixtures/story-layout";

import {
  SHARE_DESCRIPTION_STORAGE_KEY,
  SHARE_STATS_STORAGE_KEY,
  TripShareImage,
} from "./trip-share-image";

const meta = {
  title: "Components/Trips/Trip share image",
  component: TripShareImage,
  args: {
    content: {
      title: "Arco 2026",
      status: { label: "On now", tone: "success" },
      dates: "Sep 26, 2026 – Oct 10, 2026",
      description: "Fall arco trip with Ally",
    },
    stats: [
      { id: "sends", label: "Sends", value: "19", sub: "Sep 2026 – Oct 2026" },
      { id: "hardest", label: "Hardest", value: "5.12c", sub: "L'Utimo Dei Suini" },
      { id: "days", label: "Days out", value: "9", sub: null },
      { id: "firstTry", label: "Flash", value: "79%", sub: "Hardest: 5.12c" },
      { id: "streak", label: "Longest streak", value: "4 days", sub: "Oct 2026" },
    ],
  },
  decorators: [
    (Story) => (
      <StoryPage title="Trips">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof TripShareImage>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The saved choice is read when the dialog opens. */
function withSaved(ids: AnalyticsCardId[]) {
  return () => {
    localStorage.setItem(SHARE_STATS_STORAGE_KEY, JSON.stringify(ids));
    return () => localStorage.removeItem(SHARE_STATS_STORAGE_KEY);
  };
}

/** The dialog renders outside the canvas. */
async function open(canvasElement: HTMLElement) {
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Share image" }));
  const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog");
  await within(dialog).findByRole("img", {}, { timeout: 5000 });
  return dialog;
}

export const Button: Story = {};

/** The default: the first four stats in a 9:16 story, on the checkerboard. */
export const FourStats: Story = {
  beforeEach: withSaved([]),
  play: async ({ canvasElement }) => {
    await open(canvasElement);
  },
};

/** The description is off unless chosen, since some run long. */
export const WithDescription: Story = {
  beforeEach: () => {
    localStorage.setItem(SHARE_DESCRIPTION_STORAGE_KEY, "true");
    return () => localStorage.removeItem(SHARE_DESCRIPTION_STORAGE_KEY);
  },
  play: async ({ canvasElement }) => {
    await open(canvasElement);
  },
};

/** Three stats: a row of two, then one full width. */
export const ThreeStats: Story = {
  beforeEach: withSaved(["sends", "hardest", "streak"]),
  play: async ({ canvasElement }) => {
    await open(canvasElement);
  },
};

/** One stat, full width. */
export const OneStat: Story = {
  beforeEach: withSaved(["hardest"]),
  play: async ({ canvasElement }) => {
    await open(canvasElement);
  },
};

/** Cropped to the content, for pasting over any photo. */
export const Sticker: Story = {
  beforeEach: withSaved([]),
  play: async ({ canvasElement }) => {
    const dialog = await open(canvasElement);
    await userEvent.click(within(dialog).getByRole("button", { name: "Sticker" }));
    await within(dialog).findByRole("img", {}, { timeout: 5000 });
  },
};
