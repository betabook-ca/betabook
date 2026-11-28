"use client";

import type { UseOverlayStateReturn } from "@heroui/react";

import { ClimbPicker } from "@/components/climbs/climb-picker";
import { ReviewQueuedNotice, useReviewRequest } from "@/components/climbs/review-request";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useCompactViewport } from "@/hooks/use-compact-viewport";
import type { ClimbWithAreaName } from "@/lib/catalog-types";
import { climbHref } from "@/lib/slug";
import { requestClimbMerge } from "@/spa/lib/actions-client";
import { useRouter } from "@/spa/lib/navigation";

type ClimbMergeDrawerProps = {
  climbId: number;
  state: UseOverlayStateReturn;
};

/** Folds this climb into the picked one, which keeps both climbs' sends.
 * Applies immediately for an admin, otherwise queues a change request.
 *
 * Fullscreen: with the keyboard up, a sheet would show about two results. */
export function ClimbMergeDrawer({ climbId, state }: ClimbMergeDrawerProps) {
  const router = useRouter();
  const request = useReviewRequest({
    queuedNotice: "An admin needs to approve this before the duplicate is folded in.",
  });
  const compact = useCompactViewport();

  function handlePick(picked: ClimbWithAreaName): void {
    if (request.pending) return;
    request.submit(
      () => requestClimbMerge(climbId, picked.id),
      () => {
        state.close();
        router.push(climbHref(picked.id, picked.name));
      },
    );
  }

  return (
    <ResponsiveDialog
      state={state}
      title="Mark as a duplicate"
      size="lg"
      presentation="fullscreen"
      isPending={request.pending}
      onClose={request.reset}
    >
      {request.notice ? (
        <ReviewQueuedNotice notice={request.notice} onDone={state.close} />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Pick the climb this one duplicates — this climb and its sends fold into it, and this
            page won&apos;t exist separately once that lands.
          </p>
          <ClimbPicker
            onPick={handlePick}
            allowSentClimbs
            showFilters={!compact}
            excludedClimbId={climbId}
          />
          {request.error && <InlineAlert>{request.error}</InlineAlert>}
          {request.pending && <p className="text-sm text-muted">Marking as duplicate…</p>}
        </div>
      )}
    </ResponsiveDialog>
  );
}
