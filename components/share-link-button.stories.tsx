import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn, userEvent, within } from "storybook/test";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { ShareLinkButton } from "./share-link-button";

const meta = {
  title: "Components/Inputs/Share link button",
  component: ShareLinkButton,
  args: {
    name: "Bishop, March 2026",
    sentence: "Anyone with the link sees this page.",
    linkLabel: "Page link",
    path: (token: string) => `/shared/${token}`,
    share: null,
    shareOrigin: "https://betabook.ca",
    isPrivate: false,
    onShare: fn(async () => ({
      ok: true as const,
      value: { token: "8c1d3e5f7a9b0c2d4e6f8a0b1c3d5e7f", expiresAt: "2026-12-21 00:00:00" },
    })),
    onUnshare: fn(async () => ({ ok: true as const, value: undefined })),
    stopDescription: "The link stops working for everyone you sent it to.",
  },
  decorators: [
    (Story) => (
      <StoryPage
        title="Share link button"
        description="The header Share button each shareable feature uses. Features pass their own copy and actions; the button reads Shared while a link is live, and a private profile gets a notice instead of a link."
      >
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof ShareLinkButton>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The dialog renders outside the canvas. */
async function open(canvasElement: HTMLElement, name: string) {
  await userEvent.click(within(canvasElement).getByRole("button", { name }));
  await within(canvasElement.ownerDocument.body).findByRole("dialog");
}

export const NotShared: Story = {};

export const Shared: Story = {
  args: {
    share: { token: "8c1d3e5f7a9b0c2d4e6f8a0b1c3d5e7f", expiresAt: "2026-12-21 00:00:00" },
  },
};

/** A private profile can't share: the dialog says so and links to the setting. */
export const PrivateProfile: Story = {
  args: { isPrivate: true },
  play: async ({ canvasElement }) => open(canvasElement, "Share"),
};
