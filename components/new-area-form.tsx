"use client";

import { useRouter } from "next/navigation";

import { AreaForm } from "@/components/area-form";
import { areaHref } from "@/lib/slug";

export function NewAreaForm() {
  const router = useRouter();

  return (
    <AreaForm
      parentId={null}
      onDone={(areaId, areaName) => router.push(areaHref(areaId, areaName))}
    />
  );
}
