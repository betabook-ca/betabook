"use client";

import type { UseOverlayStateReturn } from "@heroui/react";

import { requestAreaReparent } from "@/actions";
import { AreaMoveDialog } from "@/components/area-move-dialog";

export function AreaReparentDialog({
  areaId,
  state,
}: {
  areaId: number;
  state: UseOverlayStateReturn;
}) {
  return (
    <AreaMoveDialog
      state={state}
      title="Change parent area"
      pendingMessage="An admin needs to approve this before the area actually moves."
      onMove={(targetId) => requestAreaReparent(areaId, targetId)}
    />
  );
}
