"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Copy } from "lucide-react";

import { ClimbListDialog } from "@/components/climb-lists/climb-list-dialog";
import type { ClimbListSummary } from "@/db/queries";

/** Copies someone else's list into the reader's own lists, under a name and
 * description they choose. The copy takes the list's climbs in list order
 * when it is saved, and nothing links it back to the original. */
export function CopyClimbListButton({
  list,
  viewerId,
  token,
}: {
  list: ClimbListSummary;
  /** The signed-in reader, who will own the copy. */
  viewerId: string;
  /** Copy through this link, for a reader who reached the list by it. */
  token?: string;
}) {
  const state = useOverlayState();
  return (
    <>
      <Button variant="outline" size="sm" onPress={state.open}>
        <Copy aria-hidden="true" className="size-4" />
        Copy to my lists
      </Button>
      <ClimbListDialog
        state={state}
        userId={viewerId}
        mode={{ kind: "copy", list, own: false, token }}
      />
    </>
  );
}
