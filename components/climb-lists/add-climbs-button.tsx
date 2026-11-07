"use client";

import { Button, useOverlayState } from "@heroui/react";
import { CirclePlus } from "lucide-react";

import { AddClimbsDialog } from "@/components/climb-lists/add-climbs-dialog";

export function AddClimbsButton({
  listId,
  listTitle,
  climbIds,
  variant,
}: {
  listId: number;
  listTitle: string;
  climbIds: readonly number[];
  variant?: "outline";
}) {
  const state = useOverlayState();
  return (
    <>
      <Button variant={variant} onPress={state.open}>
        <CirclePlus className="size-4" />
        Add climbs
      </Button>
      <AddClimbsDialog state={state} listId={listId} listTitle={listTitle} climbIds={climbIds} />
    </>
  );
}
