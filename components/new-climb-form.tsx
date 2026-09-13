"use client";

import { useRouter } from "next/navigation";

import { ClimbForm } from "@/components/climb-form";
import type { ClimbType } from "@/lib/grades";
import { climbHref } from "@/lib/slug";

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
      onDone={(climbId, climbName) =>
        router.push(climbName ? climbHref(climbId, climbName) : `/climbs/${climbId}`)
      }
    />
  );
}
