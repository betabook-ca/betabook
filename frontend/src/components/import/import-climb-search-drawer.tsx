"use client";

import type { UseOverlayStateReturn } from "@heroui/react";

import { ClimbPicker } from "@/components/climb-picker";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { ClimbCandidate, ClimbWithAreaName } from "@/db/queries";
import { useCompactViewport } from "@/hooks/use-compact-viewport";
import { foldClimbName } from "@/lib/import-matching";

export type SearchTarget = {
  rowIndex: number;
  climbName: string;
  areaName: string | null;
};

/** Seeded with the CSV row's climb and area names so a spelling fix is one
 * edit away. A pick becomes that row's climb.
 *
 * Fullscreen: with the keyboard up, a sheet would show about two results. */
export function ImportClimbSearchDrawer({
  state,
  target,
  onPick,
}: {
  state: UseOverlayStateReturn;
  target: SearchTarget | null;
  onPick: (rowIndex: number, climb: ClimbCandidate) => void;
}) {
  const compact = useCompactViewport();
  return (
    <ResponsiveDialog
      state={state}
      title={target ? `Find “${target.climbName}”` : "Find climb"}
      size="lg"
      presentation="fullscreen"
    >
      {/* Keyed by row so the picker's seeded fields reset per target
       * even if the drawer is reopened before its exit animation
       * has unmounted the previous one. */}
      {target && (
        <ClimbPicker
          key={target.rowIndex}
          allowSentClimbs
          showAreaLookup
          showFilters={!compact}
          initialName={target.climbName}
          initialAreaName={target.areaName ?? ""}
          onPick={(climb, context) => {
            onPick(target.rowIndex, toCandidate(climb, context));
            state.close();
          }}
        />
      )}
    </ResponsiveDialog>
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
    brokenOn: climb.brokenOn,
    areaName: climb.areaName,
    sendCount: context.sendCount,
    ancestors: context.ancestors,
    key: foldClimbName(climb.name),
    total: 1,
  };
}
