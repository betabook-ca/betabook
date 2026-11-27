"use client";

import type { ComponentProps } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type ConfirmDeleteDialogProps = Omit<ComponentProps<typeof ConfirmDialog>, "title"> & {
  /** What is being deleted, as the noun the heading names ("area", "climb",
   * "send"). */
  noun: string;
  title?: string;
};

/** ConfirmDialog with the standard delete wording filled in, so callers
 * don't retype "Delete this X?" and "This can't be undone." each time. */
export function ConfirmDeleteDialog({
  noun,
  title,
  description = "This can't be undone.",
  confirmLabel = "Delete",
  ...props
}: ConfirmDeleteDialogProps) {
  return (
    <ConfirmDialog
      {...props}
      title={title ?? `Delete this ${noun}?`}
      description={description}
      confirmLabel={confirmLabel}
    />
  );
}
