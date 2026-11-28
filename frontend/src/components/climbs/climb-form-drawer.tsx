"use client";

import type { UseOverlayStateReturn } from "@heroui/react";
import { useState } from "react";

import { ClimbForm } from "@/components/climbs/climb-form";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { Climb } from "@/lib/catalog-types";
import { climbHref } from "@/lib/slug";
import { useRouter } from "@/spa/lib/navigation";

type ClimbFormDrawerProps = {
  areaId: number;
  climb?: Climb;
  state: UseOverlayStateReturn;
};

export function ClimbFormDrawer({ areaId, climb, state }: ClimbFormDrawerProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  function handleDone(climbId: number, climbName: string) {
    state.close();
    if (!climb) router.push(climbHref(climbId, climbName));
  }

  return (
    <ResponsiveDialog
      state={state}
      title={climb ? "Edit climb" : "Add climb"}
      size="lg"
      presentation="fullscreen"
      isPending={pending}
    >
      <ClimbForm areaId={areaId} climb={climb} onDone={handleDone} onPendingChange={setPending} />
    </ResponsiveDialog>
  );
}
