import { Button, useOverlayState } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { mocked, userEvent, within } from "storybook/test";

import { unshareTrip } from "@/actions";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ShareTripDialog, type TripShare } from "./share-trip-dialog";

const meta = {
  title: "Components/Trips/Share trip",
  component: ShareTripDialog,
} satisfies Meta<typeof ShareTripDialog>;
export default meta;
// Each example owns its overlay state, so the dialog is open on load.
type Story = StoryObj;

const LIVE: TripShare = {
  token: "4f9c2a7e1b8d6035c9e4a1f7b2d80e36",
  expiresAt: "2026-05-15 00:00:00",
};

function Example({ share }: { share: TripShare }) {
  const state = useOverlayState({ defaultOpen: true });
  return (
    <StoryPage title="Bishop, March 2026">
      <Button onPress={state.open}>Share</Button>
      <ShareTripDialog
        state={state}
        tripId={-1}
        tripName="Bishop, March 2026"
        share={share}
        shareOrigin="https://betabook.ca"
      />
    </StoryPage>
  );
}

/** Before a link exists: what the link will show, and the expiry chosen first. */
export const NotShared: Story = { render: () => <Example share={null} /> };

/** A live link: copy it, renew it, or stop sharing. */
export const Live: Story = { render: () => <Example share={LIVE} /> };

/** Renewing keeps the token and reports the deadline the server computed. */
export const Renewed: Story = {
  render: () => <Example share={LIVE} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("button", { name: "Renew link" }));
    await page.findByText("Link renewed.");
  },
};

/** Stopping was refused: the confirmation stays open with the reason. */
export const StopFails: Story = {
  beforeEach: () => {
    mocked(unshareTrip).mockResolvedValue({
      ok: false,
      error: "Too many changes — try again in a minute",
    });
    return () => mocked(unshareTrip).mockReset();
  },
  render: () => <Example share={LIVE} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("button", { name: "Stop sharing" }));
    const dialog = within(await page.findByRole("alertdialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Stop sharing" }));
    await dialog.findByRole("alert");
  },
};
