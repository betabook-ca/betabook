"use client";

import type { UseOverlayStateReturn } from "@heroui/react";

import { requestClimbMove } from "@/actions";
import { AreaMoveDialog } from "@/components/area-move-dialog";

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
