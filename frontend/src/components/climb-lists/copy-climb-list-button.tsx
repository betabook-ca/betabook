"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Copy } from "lucide-react";

import {
  ClimbListDialog,
  type ClimbListCopySource,
} from "@/components/climb-lists/climb-list-dialog";

/** Copies someone else's list into the reader's own lists, under a name and
 * description they choose. The copy takes the list's climbs in circuit order
 * when it is saved, and nothing links it back to the original. */
export function CopyClimbListButton({
  list,
  viewerId,
  source,
}: {
  /** What the form starts from. No id: a link copy goes by `source`. */
  list: { title: string; description: string | null; climbCount: number };
  /** The signed-in reader, who will own the copy. */
  viewerId: string;
  source: ClimbListCopySource;
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
        mode={{ kind: "copy", list, own: false, source }}
      />
    </>
  );
}
