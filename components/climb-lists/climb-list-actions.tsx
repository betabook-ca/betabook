"use client";

import { Menu, useOverlayState } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteClimbList } from "@/actions";
import { ClimbListDialog } from "@/components/climb-lists/climb-list-dialog";
import { ActionsMenu } from "@/components/ui/actions-menu";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { ClimbListSummary } from "@/db/queries";
import { climbListsHref } from "@/lib/climb-lists";

/** Owner actions for a list, on its card and on its page. */
export function ClimbListActions({
  list,
  userId,
  leaveOnDelete = false,
}: {
  list: ClimbListSummary;
  userId: string;
  /** Set on the list page, to go back to the Lists tab after deleting. */
  leaveOnDelete?: boolean;
}) {
  const router = useRouter();
  const editState = useOverlayState();
  const copyState = useOverlayState();
  const deleteState = useOverlayState();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteClimbList(list.id);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      deleteState.close();
      if (leaveOnDelete) router.push(climbListsHref(userId));
      else router.refresh();
    });
  }

  return (
    <>
      <ActionsMenu
        ariaLabel={`Actions for ${list.title}`}
        onAction={(key) => {
          if (key === "edit") editState.open();
          if (key === "copy") copyState.open();
          if (key === "delete") {
            setDeleteError(null);
            deleteState.open();
          }
        }}
      >
        <Menu.Item id="edit">Edit details</Menu.Item>
        <Menu.Item id="copy">Copy list</Menu.Item>
        <Menu.Item id="delete">Delete</Menu.Item>
      </ActionsMenu>

      <ClimbListDialog state={editState} userId={userId} mode={{ kind: "edit", list }} />
      <ClimbListDialog
        state={copyState}
        userId={userId}
        mode={{ kind: "copy", list, own: true, source: { listId: list.id } }}
      />
      <ConfirmDeleteDialog
        state={deleteState}
        noun="list"
        description="Deleting a list won't delete any climbs or anyone's copies of it."
        onConfirm={handleDelete}
        isPending={pending}
        error={deleteError}
      />
    </>
  );
}
