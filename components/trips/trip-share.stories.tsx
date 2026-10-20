import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { TripShare } from "./trip-share";

const meta = {
  title: "Components/Trips/Trip share",
  component: TripShare,
  args: {
    tripId: -1,
    tripName: "Bishop, March 2026",
    share: null,
    shareOrigin: "https://betabook.ca",
    isPrivate: false,
    today: "2026-10-20",
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
async function open(canvasElement: HTMLElement, name: string) {
  await userEvent.click(within(canvasElement).getByRole("button", { name }));
  await within(canvasElement.ownerDocument.body).findByRole("dialog");
}

export const Button: Story = {};

/** Before a link exists: what the link will show, and the expiry chosen first. */
export const NotShared: Story = {
  play: async ({ canvasElement }) => {
    await open(canvasElement, "Share");
  },
};

/** An expired link reads as not shared, and the dialog offers to renew it. */
export const Expired: Story = {
  args: {
    share: { token: "8c1d3e5f7a9b0c2d4e6f8a0b1c3d5e7f", expiresAt: "2026-09-01 00:00:00" },
  },
  play: async ({ canvasElement }) => {
    await open(canvasElement, "Share");
  },
};

/** A private profile can't share: the dialog says so and links to the setting. */
export const PrivateProfile: Story = {
  args: { isPrivate: true },
  play: async ({ canvasElement }) => {
    await open(canvasElement, "Share");
  },
};

/** A live link: copy it, renew it (same token, expiry restarted) or stop sharing. */
export const Shared: Story = {
  args: {
    share: { token: "8c1d3e5f7a9b0c2d4e6f8a0b1c3d5e7f", expiresAt: "2026-11-18 00:00:00" },
  },
  play: async ({ canvasElement }) => {
    await open(canvasElement, "Shared");
  },
};
