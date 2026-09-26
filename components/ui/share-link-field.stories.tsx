import { Button } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RotateCcw } from "lucide-react";
import { userEvent, within } from "storybook/test";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { ShareLinkField } from "./share-link-field";

const meta = {
  title: "Components/Inputs/Share link field",
  component: ShareLinkField,
  args: {
    label: "Profile link",
    url: "https://betabook.ca/users/Qm7c2VdN4pX8rT1yK6hB9wLs3JfZ0aEu?share=4f9c2a7e1b8d6035c9e4a1f7b2d80e36",
    shareTitle: "Alex Rivera on Betabook",
    description: "Anyone with the link sees your name, photo, send stats and latest sends.",
  },
  decorators: [
    (Story) => (
      <StoryPage title="Share your profile">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof ShareLinkField>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The gallery iframe has no clipboard permission, so the outcome is scripted. */
function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return () => {
    Reflect.deleteProperty(navigator, "clipboard");
  };
}

export const Default: Story = {};

/** Anything specific to one link — a reset, a revoke — sits beside the two
 * buttons that always apply. */
export const WithActions: Story = {
  args: {
    actions: (
      <Button variant="ghost">
        <RotateCcw aria-hidden="true" className="size-4" />
        Reset link
      </Button>
    ),
  },
};

/** A caller's own outcome shares the one live region with the copy result. */
export const ExternalNotice: Story = { args: { notice: "Link reset." } };

export const ExternalError: Story = { args: { error: "Couldn't reset the link. Try again." } };

export const Copied: Story = {
  beforeEach: () => stubClipboard(async () => {}),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Copy link" }));
    await canvas.findByText("Link copied");
  },
};

/** The clipboard was refused, so the fallback is spelled out: the field
 * selects itself on focus. */
export const CopyRefused: Story = {
  beforeEach: () =>
    stubClipboard(async () => {
      throw new DOMException("Write permission denied.", "NotAllowedError");
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Copy link" }));
    await canvas.findByRole("alert");
  },
};
