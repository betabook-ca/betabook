"use client";

import type { UseOverlayStateReturn } from "@heroui/react";
import { useRouter } from "next/navigation";

import { ClimbForm } from "@/components/climb-form";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { Climb } from "@/db/queries";
import { climbHref } from "@/lib/slug";

type ClimbFormDrawerProps = {
  areaId: number;
  climb?: Climb;
  state: UseOverlayStateReturn;
};

export function ClimbFormDrawer({ areaId, climb, state }: ClimbFormDrawerProps) {
  const router = useRouter();

  function handleDone(climbId: number, climbName?: string) {
    state.close();
    // Editing an existing climb just closes the drawer in place; creating a
    // new one lands the viewer on it, same as the standalone /climbs/new page.
    if (!climb) router.push(climbName ? climbHref(climbId, climbName) : `/climbs/${climbId}`);
  }

  return (
    <ResponsiveDialog
      state={state}
      title={climb ? "Edit climb" : "Add climb"}
      size="lg"
      presentation="fullscreen"
    >
      <ClimbForm areaId={areaId} climb={climb} onDone={handleDone} />
    </ResponsiveDialog>
  );
}
