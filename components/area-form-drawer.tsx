"use client";

import type { UseOverlayStateReturn } from "@heroui/react";
import { useRouter } from "next/navigation";

import { AreaForm } from "@/components/area-form";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { Area } from "@/db/queries";
import { areaHref } from "@/lib/slug";

type AreaFormDrawerProps = {
  /** Fixed parent for creating a subarea (no area picker shown). Ignored
   * when `area` is present (editing). */
  parentId?: number;
  area?: Area;
  state: UseOverlayStateReturn;
};

export function AreaFormDrawer({ parentId, area, state }: AreaFormDrawerProps) {
  const router = useRouter();

  function handleDone(areaId: number, areaName: string) {
    state.close();
    if (!area) router.push(areaHref(areaId, areaName));
  }

  return (
    <ResponsiveDialog state={state} title={area ? "Edit area" : "Add area"}>
      <AreaForm parentId={parentId ?? null} area={area} onDone={handleDone} />
    </ResponsiveDialog>
  );
}
