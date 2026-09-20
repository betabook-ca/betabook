"use client";

import type { UseOverlayStateReturn } from "@heroui/react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type ConfirmDeleteDialogProps = {
  state: UseOverlayStateReturn;
  /** What is being deleted, as the noun the heading names ("area", "climb",
   * "send"). */
  noun: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  isPending: boolean;
  /** Failure message from the last delete attempt, if any — shown inline so
   * the viewer can retry or cancel. */
  error?: string | null;
  /** Set instead of closing the dialog when a non-admin's delete was queued
   * for admin review rather than applied — swaps the confirm/cancel footer
   * for a single acknowledgement, since nothing was actually deleted yet. */
  pendingNotice?: string | null;
};

/** Deleting, specifically: ConfirmDialog with the wording every delete in
 * the app shares, so no caller has to spell out "Delete this X?" and
 * "This can't be undone." and risk phrasing it differently. */
export function ConfirmDeleteDialog({
  state,
  noun,
  title,
  description = "This can't be undone.",
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  isPending,
  error,
  pendingNotice,
}: ConfirmDeleteDialogProps) {
  return (
    <ConfirmDialog
      state={state}
      title={title ?? `Delete this ${noun}?`}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      onConfirm={onConfirm}
      isPending={isPending}
      error={error}
      pendingNotice={pendingNotice}
    />
  );
}
