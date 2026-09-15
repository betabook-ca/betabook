"use client";

import { Menu, useOverlayState } from "@heroui/react";
import { useState, useTransition } from "react";

import { deleteJournalEntry } from "@/actions";
import { JournalEntryEditDrawer } from "@/components/journal/journal-entry-edit-drawer";
import { ActionsMenu } from "@/components/ui/actions-menu";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { JournalEntry } from "@/db/queries";

export function EntryActionsMenu({ entry }: { entry: JournalEntry }) {
  const editState = useOverlayState();
  const deleteState = useOverlayState();
  const [pending, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDelete() {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteJournalEntry(entry.id);
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
        ariaLabel="Entry actions"
        triggerClassName="size-11"
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
      <JournalEntryEditDrawer entry={entry} state={editState} />
      <ConfirmDeleteDialog
        noun={entry.isAscent ? "entry and the send it recorded" : "entry"}
        state={deleteState}
        onConfirm={handleDelete}
        isPending={pending}
        error={deleteError}
      />
    </>
  );
}
