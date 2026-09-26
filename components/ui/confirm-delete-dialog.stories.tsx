import { Button, useOverlayState } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ComponentProps } from "react";

import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { PageTitle } from "./typography";

const meta = {
  title: "Components/Feedback/Confirm delete dialog",
  component: ConfirmDeleteDialog,
} satisfies Meta<typeof ConfirmDeleteDialog>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
function DeleteExample() {
  const state = useOverlayState();
  const [deleted, setDeleted] = useState(false);
  return (
    <div className="flex flex-col items-start gap-4">
      <PageTitle>Delete confirmation</PageTitle>
      <p className="text-sm text-muted">Sample interaction. No account data is changed.</p>
      <Button variant="danger" onPress={state.open} isDisabled={deleted}>
        Delete sample send
      </Button>
      <p role="status">{deleted ? "Sample send deleted." : "Sample send is saved."}</p>
      <ConfirmDeleteDialog
        state={state}
        noun="send"
        isPending={false}
        onConfirm={() => {
          setDeleted(true);
          state.close();
        }}
      />
    </div>
  );
}
export const DeleteConfirmation: Story = { render: () => <DeleteExample /> };

/** One state of the dialog, open on load. */
function StateExample(
  props: Omit<ComponentProps<typeof ConfirmDeleteDialog>, "state" | "noun" | "onConfirm">,
) {
  const state = useOverlayState({ defaultOpen: true });
  return (
    <div className="flex flex-col items-start gap-4">
      <PageTitle>Delete confirmation</PageTitle>
      <Button variant="danger" onPress={state.open}>
        Delete sample send
      </Button>
      <ConfirmDeleteDialog state={state} noun="send" onConfirm={state.close} {...props} />
    </div>
  );
}

/** While the delete runs: Saving… replaces the label and both buttons wait. */
export const Pending: Story = { render: () => <StateExample isPending /> };

/** The delete was refused: the reason stays inline so the viewer can retry or cancel. */
export const Failed: Story = {
  render: () => <StateExample isPending={false} error="Couldn't delete this send. Try again." />,
};

/** A non-admin's delete was queued for review rather than applied, so one
 * acknowledgement replaces the confirm and cancel pair. */
export const QueuedForReview: Story = {
  render: () => (
    <StateExample
      isPending={false}
      pendingNotice="An admin needs to approve this before the area is actually removed."
    />
  ),
};
