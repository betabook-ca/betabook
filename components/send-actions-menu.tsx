"use client";

import { Menu, useOverlayState } from "@heroui/react";
import { useState, useTransition } from "react";

import { deleteSend } from "@/actions";
import { SendFormDrawer } from "@/components/send-form-drawer";
import { ActionsMenu } from "@/components/ui/actions-menu";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { EditableSend, SendableClimb } from "@/db/queries";

type SendActionsMenuProps = {
  climb: SendableClimb;
  send: EditableSend;
};

/** The "..." actions menu shown on a viewer's own send row — Edit opens the
 * shared SendFormDrawer, Delete asks for confirmation before removing the
 * send. */
export function SendActionsMenu({ climb, send }: SendActionsMenuProps) {
  const editState = useOverlayState();
  const deleteState = useOverlayState();
  const [pending, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDelete() {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteSend(send.id);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      deleteState.close();
    });
  }

  return (
    <>
      <ActionsMenu
        ariaLabel="Send actions"
        onAction={(key) => {
          if (key === "edit") editState.open();
          if (key === "delete") {
            setDeleteError(null);
            deleteState.open();
          }
        }}
      >
        <Menu.Item id="edit">Edit</Menu.Item>
        <Menu.Item id="delete">Delete</Menu.Item>
      </ActionsMenu>
      <SendFormDrawer climb={climb} existingSend={send} state={editState} />
      <ConfirmDeleteDialog
        noun="send"
        description="The send will be removed. Your journal entries will remain, and their commentary will keep its current audience."
        state={deleteState}
        onConfirm={handleDelete}
        isPending={pending}
        error={deleteError}
      />
    </>
  );
}
