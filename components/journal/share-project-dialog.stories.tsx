import { Button, useOverlayState } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { PinnedProject } from "@/db/queries";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ShareProjectDialog } from "./share-project-dialog";

const meta = {
  title: "Components/Journal/Share project",
  component: ShareProjectDialog,
} satisfies Meta<typeof ShareProjectDialog>;
export default meta;
// Each example owns its overlay state, so the dialog is open on load.
type Story = StoryObj;

const LIVE: PinnedProject["share"] = {
  token: "4f9c2a7e1b8d6035c9e4a1f7b2d80e36",
  expiresAt: "2026-10-06 00:00:00",
};

function Example({ share }: { share: PinnedProject["share"] }) {
  const state = useOverlayState({ defaultOpen: true });
  return (
    <StoryPage title="Moonlight Arete">
      <Button onPress={state.open}>Share</Button>
      <ShareProjectDialog
        state={state}
        climbId={-1}
        climbName="Moonlight Arete"
        share={share}
        shareOrigin="https://betabook.ca"
      />
    </StoryPage>
  );
}

/** Before a link exists: what the link will show, and the expiry chosen first. */
export const NotShared: Story = { render: () => <Example share={null} /> };

/** A live link: copy it, renew it (same token, expiry restarted) or stop sharing. */
export const Live: Story = { render: () => <Example share={LIVE} /> };
