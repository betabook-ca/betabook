import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { TripShare } from "./trip-share";

const meta = {
  title: "Components/Trips/Trip share",
  component: TripShare,
  args: {
    tripName: "Bishop, March 2026",
    url: "https://betabook.ca/users/alex/trips/2?share=4f9c2a7e1b8d6035c9e4a1f7b2d80e36",
  },
  decorators: [
    (Story) => (
      <StoryPage title="Trips">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof TripShare>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The dialog renders outside the canvas. */
async function open(canvasElement: HTMLElement) {
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Share" }));
  await within(canvasElement.ownerDocument.body).findByRole("dialog");
}

export const Button: Story = {};

/** With a share URL. */
export const Link: Story = {
  play: async ({ canvasElement }) => {
    await open(canvasElement);
  },
};

/** With a private profile. */
export const PrivateProfile: Story = {
  args: { url: null },
  play: async ({ canvasElement }) => {
    await open(canvasElement);
  },
};
