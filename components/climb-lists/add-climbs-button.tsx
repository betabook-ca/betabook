"use client";

import { Button, useOverlayState } from "@heroui/react";
import { CirclePlus } from "lucide-react";

import { AddClimbsDialog } from "@/components/climb-lists/add-climbs-dialog";

export function AddClimbsButton({
  listId,
  listTitle,
  climbIds,
  variant,
  isDisabled = false,
}: {
  listId: number;
  listTitle: string;
  climbIds: readonly number[];
  variant?: "outline";
  /** While the list editor is open: its own Add climbs stages climbs there. */
  isDisabled?: boolean;
}) {
  const state = useOverlayState();
  return (
    <>
      <Button variant={variant} isDisabled={isDisabled} onPress={state.open}>
        <CirclePlus className="size-4" />
        Add climbs
      </Button>
      <AddClimbsDialog state={state} listId={listId} listTitle={listTitle} climbIds={climbIds} />
    </>
  );
}
