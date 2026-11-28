"use client";

import type { UseOverlayStateReturn } from "@heroui/react";

import { AreaMoveDialog } from "@/components/areas/area-move-dialog";
import { requestClimbMove } from "@/spa/lib/actions-client";

export function ClimbMoveDialog({
  climbId,
  state,
}: {
  climbId: number;
  state: UseOverlayStateReturn;
}) {
  return (
    <AreaMoveDialog
      state={state}
      title="Move to a different area"
      pendingMessage="An admin needs to approve this before the climb actually moves."
      onMove={(targetId) => requestClimbMove(climbId, targetId)}
    />
  );
}
