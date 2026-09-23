"use client";

import { Menu, Tooltip, useOverlayState } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteSend, requestClimbDelete } from "@/actions";
import { ClimbBreakDrawer } from "@/components/climb-break-drawer";
import { ClimbEditRequestDrawer } from "@/components/climb-edit-request-drawer";
import { ClimbMergeDrawer } from "@/components/climb-merge-drawer";
import { ClimbMoveDialog } from "@/components/climb-move-dialog";
import { SendFormDrawer } from "@/components/send-form-drawer";
import { ActionsMenu } from "@/components/ui/actions-menu";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { Climb, EditableSend } from "@/db/queries";

type ClimbActionsMenuProps = {
  climb: Climb;
  /** The viewer's own send, folded in so the header has one "…" button. */
  send?: EditableSend;
};

/** The "..." menu next to a climb's title. Structural changes are
 * moderation-gated: applied immediately for an admin, otherwise queued. */
export function ClimbActionsMenu({ climb, send }: ClimbActionsMenuProps) {
  const router = useRouter();
  const editState = useOverlayState();
  const moveState = useOverlayState();
  const mergeState = useOverlayState();
  const breakState = useOverlayState();
  const deleteState = useOverlayState();
  const editSendState = useOverlayState();
  const deleteSendState = useOverlayState();
  const [pending, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePendingNotice, setDeletePendingNotice] = useState<string | null>(null);
  const [deleteSendError, setDeleteSendError] = useState<string | null>(null);
  const hasSends = climb.sendCount > 0;

  function handleDelete() {
    setDeleteError(null);
    startTransition(async () => {
      const result = await requestClimbDelete(climb.id);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      if (result.value.status === "pending") {
        setDeletePendingNotice(
          "An admin needs to approve this before the climb is actually removed.",
        );
        return;
      }
      deleteState.close();
      router.push(`/areas/${climb.areaId}`);
    });
  }

  function handleDeleteSend() {
    if (!send) return;
    setDeleteSendError(null);
    startTransition(async () => {
      const result = await deleteSend(send.id);
      if (!result.ok) {
        setDeleteSendError(result.error);
        return;
      }
      deleteSendState.close();
    });
  }

  // Every label names its target — the same menu holds actions on the
  // viewer's logged send and on the climb itself, so a bare "Edit" or
  // "Delete" would be ambiguous.
  const climbItems = (
    <>
      <Menu.Item id="edit">Request climb edit…</Menu.Item>
      <Menu.Item id="move">Move climb to area…</Menu.Item>
      <Menu.Item id="merge">Mark climb as duplicate…</Menu.Item>
      {climb.brokenOn === null && <Menu.Item id="break">Report climb as broken…</Menu.Item>}
      <Menu.Item id="delete" isDisabled={hasSends} textValue="Delete climb">
        {hasSends ? (
          // A disabled Menu.Item gets `pointer-events: none`, which would
          // also block hover on a wrapping Tooltip.Trigger — `pointer-
          // events-auto` here re-enables hit-testing for just this inner
          // element so the tooltip still shows. Note: the item itself must
          // stay a direct child of the collection for react-aria to
          // register it — wrapping the whole Menu.Item in Tooltip.Trigger
          // (rather than wrapping its label) makes it vanish from the menu.
          <Tooltip.Root delay={0}>
            <Tooltip.Trigger className="pointer-events-auto">Delete climb</Tooltip.Trigger>
            <Tooltip.Content>Can&apos;t delete a climb with logged sends.</Tooltip.Content>
          </Tooltip.Root>
        ) : (
          "Delete climb"
        )}
      </Menu.Item>
    </>
  );

  return (
    <>
      <ActionsMenu
        ariaLabel={send ? "Send and climb actions" : "Climb actions"}
        onAction={(key) => {
          if (key === "edit-send") editSendState.open();
          if (key === "delete-send") {
            setDeleteSendError(null);
            deleteSendState.open();
          }
          if (key === "edit") editState.open();
          if (key === "move") moveState.open();
          if (key === "merge") mergeState.open();
          if (key === "break") breakState.open();
          if (key === "delete") {
            setDeleteError(null);
            setDeletePendingNotice(null);
            deleteState.open();
          }
        }}
      >
        {send ? (
          <>
            <Menu.Section>
              <Menu.Item id="edit-send">Edit your send…</Menu.Item>
              <Menu.Item id="delete-send">Delete your send</Menu.Item>
            </Menu.Section>
            <Menu.Section>{climbItems}</Menu.Section>
          </>
        ) : (
          climbItems
        )}
      </ActionsMenu>
      {send && <SendFormDrawer existingSend={send} state={editSendState} />}
      {send && (
        <ConfirmDeleteDialog
          noun="send"
          state={deleteSendState}
          onConfirm={handleDeleteSend}
          isPending={pending}
          error={deleteSendError}
        />
      )}
      <ClimbEditRequestDrawer climb={climb} state={editState} />
      <ClimbMoveDialog climbId={climb.id} state={moveState} />
      <ClimbMergeDrawer climbId={climb.id} state={mergeState} />
      <ClimbBreakDrawer climb={climb} state={breakState} />
      <ConfirmDeleteDialog
        noun="climb"
        state={deleteState}
        onConfirm={handleDelete}
        isPending={pending}
        error={deleteError}
        pendingNotice={deletePendingNotice}
      />
    </>
  );
}
