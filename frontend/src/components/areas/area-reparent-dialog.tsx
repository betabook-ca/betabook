"use client";

import type { UseOverlayStateReturn } from "@heroui/react";

import { AreaMoveDialog } from "@/components/areas/area-move-dialog";
import { requestAreaReparent } from "@/spa/lib/actions-client";

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
