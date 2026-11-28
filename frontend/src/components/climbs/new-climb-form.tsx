"use client";

import { ClimbForm } from "@/components/climbs/climb-form";
import type { ClimbType } from "@/lib/grades";
import { climbHref } from "@/lib/slug";
import { useRouter } from "@/spa/lib/navigation";

export function NewClimbForm({
  initial,
}: {
  initial?: {
    name?: string;
    type?: ClimbType;
    areaName?: string;
    area?: { id: number; name: string; ancestorPath: string | null };
  };
}) {
  const router = useRouter();

  return (
    <ClimbForm
      areaId={null}
      initial={initial}
      onDone={(climbId, climbName) => router.push(climbHref(climbId, climbName))}
    />
  );
}
