"use client";

import type { UseOverlayStateReturn } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { requestClimbMerge } from "@/actions";
import { ClimbPicker } from "@/components/climb-picker";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { ClimbWithAreaName } from "@/db/queries";
import { climbHref } from "@/lib/slug";

type ClimbMergeDrawerProps = {
  climbId: number;
  state: UseOverlayStateReturn;
};

/** Folds this climb into the picked one, which keeps both climbs' sends.
 * Applies immediately for an admin, otherwise queues a change request. */
export function ClimbMergeDrawer({ climbId, state }: ClimbMergeDrawerProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handlePick(target: ClimbWithAreaName): void {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await requestClimbMerge(climbId, target.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.value.status === "pending") {
        setPendingNotice("An admin needs to approve this before the duplicate is folded in.");
        return;
      }
      state.close();
      router.push(climbHref(target.id, target.name));
    });
  }

  function reset() {
    setError(null);
    setPendingNotice(null);
  }

  return (
    <ResponsiveDialog
      state={state}
      title="Mark as a duplicate"
      size="lg"
      isPending={pending}
      onClose={reset}
    >
      {pendingNotice ? (
        <p className="text-sm text-muted">{pendingNotice}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Pick the climb this one duplicates — this climb and its sends fold into it, and this
            page won&apos;t exist separately once that lands.
          </p>
          <ClimbPicker onPick={handlePick} allowSentClimbs excludedClimbId={climbId} />
          {error && <InlineAlert>{error}</InlineAlert>}
          {pending && <p className="text-sm text-muted">Marking as duplicate…</p>}
        </div>
      )}
    </ResponsiveDialog>
  );
}
