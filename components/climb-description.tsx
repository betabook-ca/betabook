"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Pencil } from "lucide-react";

import { ClimbFormDrawer } from "@/components/climb-form-drawer";
import type { Climb } from "@/db/queries";
import { missingDescriptionMessage } from "@/lib/descriptions";

/** A climb's description, with the pencil that edits it sitting right next to
 * it — same affordance as AreaDescription. Name, discipline, and grade are
 * fixed at creation, so the edit drawer this opens only ever touches the
 * description. */
export function ClimbDescription({ climb }: { climb: Climb }) {
  const editState = useOverlayState();

  return (
    <>
      <p className="mt-1 flex items-start gap-1.5 text-muted">
        <span className={`min-w-0 ${climb.description ? "" : "italic"}`}>
          {climb.description || missingDescriptionMessage()}
        </span>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label={climb.description ? "Edit climb" : "Add a description"}
          onPress={editState.open}
          className="size-6 shrink-0"
        >
          <Pencil className="size-3.5" />
        </Button>
      </p>
      <ClimbFormDrawer areaId={climb.areaId} climb={climb} state={editState} />
    </>
  );
}
