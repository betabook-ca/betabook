import { Button, useOverlayState } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ComponentProps } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { ConfirmDialog } from "./confirm-dialog";

const meta = {
  title: "Components/Feedback/Confirm dialog",
  component: ConfirmDialog,
} satisfies Meta<typeof ConfirmDialog>;
export default meta;
// Each example owns its overlay state, so the dialog is open on load and can be reopened.
type Story = StoryObj;

type DialogProps = Omit<ComponentProps<typeof ConfirmDialog>, "state" | "onConfirm">;

function Example({ label, ...props }: DialogProps & { label: string }) {
  const state = useOverlayState({ defaultOpen: true });
  return (
    <StoryPage title="Confirm dialog">
      <Button onPress={state.open}>{label}</Button>
      <ConfirmDialog state={state} onConfirm={state.close} {...props} />
    </StoryPage>
  );
}

const UNTRACK = {
  title: "Untrack Moonlight Arete?",
  description:
    "It leaves your Projects tab only. Every session and journal entry on this climb is kept, and you can track it again whenever you like.",
  confirmLabel: "Untrack",
  cancelLabel: "Keep tracking",
  tone: "default",
  isPending: false,
} as const;

/** Nothing is destroyed, so the action is primary rather than danger, and
 * the cancel label says what staying means. */
export const Untrack: Story = { render: () => <Example label="Untrack" {...UNTRACK} /> };

/** The default tone, for anything that destroys or rejects. */
export const Danger: Story = {
  render: () => (
    <Example
      label="Reject"
      title="Reject this change?"
      description="The requester is told it was turned down."
      confirmLabel="Reject"
      isPending={false}
    />
  ),
};

/** While the action runs: the label swaps and both buttons wait, so a second
 * press cannot start a second request. */
export const Pending: Story = { render: () => <Example label="Untrack" {...UNTRACK} isPending /> };

/** The last attempt failed: the reason stays inline so the viewer can retry
 * or cancel. */
export const Failed: Story = {
  render: () => (
    <Example label="Untrack" {...UNTRACK} error="Too many changes — try again in a minute" />
  ),
};

/** Queued for admin review rather than applied: one acknowledgement replaces
 * the confirm and cancel pair, since nothing has happened yet. */
export const QueuedForReview: Story = {
  render: () => (
    <Example
      label="Delete"
      title="Delete this area?"
      confirmLabel="Delete"
      isPending={false}
      pendingNotice="An admin needs to approve this before the area is actually removed."
    />
  ),
};
