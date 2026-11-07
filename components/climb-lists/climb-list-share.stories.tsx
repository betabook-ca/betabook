import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbListShare } from "./climb-list-share";

const meta = {
  title: "Components/Climb lists/List share",
  component: ClimbListShare,
  args: {
    listId: -1,
    listTitle: "Red River classics",
    share: null,
    shareOrigin: "https://betabook.ca",
    isPrivate: false,
  },
  decorators: [
    (Story) => (
      <StoryPage title="Lists">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof ClimbListShare>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The dialog renders outside the canvas. */
async function open(canvasElement: HTMLElement, name: string) {
  await userEvent.click(within(canvasElement).getByRole("button", { name }));
  await within(canvasElement.ownerDocument.body).findByRole("dialog");
}

/** Before a link exists: what the link will show, including that it works
 * while the lists setting is Only me. */
export const NotShared: Story = {
  play: async ({ canvasElement }) => open(canvasElement, "Share"),
};

export const Shared: Story = {
  args: { share: { token: "0123456789abcdef0123456789abcdef", expiresAt: null } },
  play: async ({ canvasElement }) => open(canvasElement, "Shared"),
};

export const PrivateProfile: Story = {
  args: { isPrivate: true },
  play: async ({ canvasElement }) => open(canvasElement, "Share"),
};
