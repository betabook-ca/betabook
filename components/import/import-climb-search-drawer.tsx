"use client";

import { Drawer } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";

import { ClimbPicker } from "@/components/climb-picker";
import { PAGE_MAX_WIDTH_CLASS } from "@/components/ui/layout";
import type { ClimbCandidate, ClimbWithAreaName } from "@/db/queries";
import { foldClimbName } from "@/lib/import-matching";

export type SearchTarget = {
  rowIndex: number;
  climbName: string;
  areaName: string | null;
};

/** The climb search from the Log Send drawer, seeded with the CSV row's
 * climb and area names so a spelling fix is one edit away. A pick becomes
 * that row's climb. */
export function ImportClimbSearchDrawer({
  state,
  target,
  onPick,
}: {
  state: UseOverlayStateReturn;
  target: SearchTarget | null;
  onPick: (rowIndex: number, climb: ClimbCandidate) => void;
}) {
  return (
    <Drawer.Backdrop isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <Drawer.Content>
        <Drawer.Dialog className={`mx-auto w-full ${PAGE_MAX_WIDTH_CLASS}`}>
          <Drawer.Header>
            <Drawer.Heading>{target ? `Find “${target.climbName}”` : "Find climb"}</Drawer.Heading>
            <Drawer.CloseTrigger />
          </Drawer.Header>
          <Drawer.Body>
            {/* Keyed by row so the picker's seeded fields reset per target
             * even if the drawer is reopened before its exit animation
             * has unmounted the previous one. */}
            {target && (
              <ClimbPicker
                key={target.rowIndex}
                allowSentClimbs
                showAreaLookup
                initialName={target.climbName}
                initialAreaName={target.areaName ?? ""}
                onPick={(climb, context) => {
                  onPick(target.rowIndex, toCandidate(climb, context));
                  state.close();
                }}
              />
            )}
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

/** A search result as a ClimbCandidate. Result breadcrumbs stop two levels
 * up, so a hand-picked climb's path can be shorter than a looked-up one's. */
function toCandidate(
  climb: ClimbWithAreaName,
  context: { ancestors: { id: number; name: string }[]; sendCount: number; sent: boolean },
): ClimbCandidate {
  return {
    id: climb.id,
    areaId: climb.areaId,
    name: climb.name,
    type: climb.type,
    grade: climb.grade,
    areaName: climb.areaName,
    sendCount: context.sendCount,
    ancestors: context.ancestors,
    key: foldClimbName(climb.name),
    total: 1,
  };
}
