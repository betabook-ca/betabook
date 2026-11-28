"use client";

import type { UseOverlayStateReturn } from "@heroui/react";
import { useState } from "react";

import { AreaForm } from "@/components/areas/area-form";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { Area } from "@/lib/catalog-types";
import { areaHref } from "@/lib/slug";
import { useRouter } from "@/spa/lib/navigation";

type AreaFormDrawerProps = {
  /** Fixed parent for creating a subarea (no area picker shown). Ignored
   * when `area` is present (editing). */
  parentId?: number;
  area?: Area;
  state: UseOverlayStateReturn;
};

export function AreaFormDrawer({ parentId, area, state }: AreaFormDrawerProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  function handleDone(areaId: number, areaName: string) {
    state.close();
    if (!area) router.push(areaHref(areaId, areaName));
  }

  return (
    <ResponsiveDialog state={state} title={area ? "Edit area" : "Add area"} isPending={pending}>
      <AreaForm
        parentId={parentId ?? null}
        area={area}
        onDone={handleDone}
        onPendingChange={setPending}
      />
    </ResponsiveDialog>
  );
}
