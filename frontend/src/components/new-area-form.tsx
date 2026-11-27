"use client";

import { AreaForm } from "@/components/area-form";
import { areaHref } from "@/lib/slug";
import { useRouter } from "@/spa/lib/navigation";

export function NewAreaForm() {
  const router = useRouter();

  return (
    <AreaForm
      parentId={null}
      onDone={(areaId, areaName) => router.push(areaHref(areaId, areaName))}
    />
  );
}
