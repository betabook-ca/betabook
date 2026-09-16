import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { mocked, userEvent, within } from "storybook/test";

import { rejectChangeRequest } from "@/actions";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ApproveRejectControls } from "./approve-reject-controls";

const meta = {
  title: "Components/Moderation/Review controls",
  component: ApproveRejectControls,
  args: { requestId: -1, alreadyApproved: false },
  decorators: [
    (Story) => (
      <StoryPage title="Review a change request">
        <Story />
      </StoryPage>
    ),
  ],
  beforeEach: () => {
    mocked(rejectChangeRequest).mockResolvedValue({
      ok: false,
      error: "Couldn't save this decision. Try again.",
    });
    return () => mocked(rejectChangeRequest).mockReset();
  },
} satisfies Meta<typeof ApproveRejectControls>;
export default meta;

export const RejectionFails: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole("button", { name: "Reject" }));
    const dialog = within(page.getByRole("alertdialog"));
    await userEvent.type(dialog.getByRole("textbox"), "Please keep the original name.");
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await dialog.findByRole("alert");
  },
};
