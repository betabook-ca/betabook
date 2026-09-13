import { Button, useOverlayState } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

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
