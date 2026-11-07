"use client";

import { Button, useOverlayState } from "@heroui/react";
import { ListPlus } from "lucide-react";

import {
  AddToListDialog,
  type ClimbListChoicesFetcher,
} from "@/components/climb-lists/add-to-list-dialog";

/** The climb page's secondary action beside Log: an outline button that opens
 * one checkbox per list. */
export function AddToListButton({
  climb,
  viewerId,
  fetcher,
}: {
  climb: { id: number; name: string };
  /** The signed-in climber, whose lists it offers. */
  viewerId: string;
  /** For stories and tests. Production reads the climber's lists by API. */
  fetcher?: ClimbListChoicesFetcher;
}) {
  const state = useOverlayState();
  return (
    <>
      <Button variant="outline" className="gap-2" onPress={state.open}>
        <ListPlus aria-hidden className="size-5" />
        Add to list
      </Button>
      <AddToListDialog state={state} userId={viewerId} climb={climb} fetcher={fetcher} />
    </>
  );
}
