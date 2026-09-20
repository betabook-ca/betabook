"use client";

import { AlertDialog, Button } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import type { ReactNode } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";

type ConfirmDialogProps = {
  state: UseOverlayStateReturn;
  title: string;
  description?: string;
  /** Anything the viewer fills in before confirming — a reason, a date.
   * Keep it to one field: past that this is a form, and a form belongs in a
   * ResponsiveDialog. */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` for anything that destroys or rejects; the default for the
   * rest. */
  tone?: "danger" | "default";
  onConfirm: () => void;
  isPending: boolean;
  /** Failure message from the last attempt, if any — shown inline so the
   * viewer can retry or cancel. */
  error?: string | null;
  /** Set instead of closing when a non-admin's action was queued for review
   * rather than applied — swaps the confirm/cancel footer for a single
   * acknowledgement, since nothing actually happened yet. */
  pendingNotice?: string | null;
  /** Runs after the dialog closes by any route — Cancel, Escape or the
   * backdrop — so a reason typed into `children` and a failed attempt's
   * error can't ride along into the next one. */
  onClose?: () => void;
};

/** The app's one confirmation: a centered alert dialog at every width.
 *
 * Deliberately not responsive. A question the page asks is an interruption,
 * not a task — a bottom sheet's chrome dwarfs one sentence and two buttons,
 * and its drag-to-dismiss advertises a gesture that should not be how a
 * destructive choice gets resolved. Everything that destroys, rejects or
 * gates goes through here, so the wording, the button order and the danger
 * styling never drift between entities.
 *
 * Anything with a form in it wants ResponsiveDialog instead. */
export function ConfirmDialog({
  state,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  isPending,
  error,
  pendingNotice,
  onClose,
}: ConfirmDialogProps) {
  function close() {
    state.close();
    onClose?.();
  }

  return (
    <AlertDialog.Backdrop
      isOpen={state.isOpen}
      onOpenChange={(open) => {
        if (isPending) return;
        state.setOpen(open);
        if (!open) onClose?.();
      }}
    >
      <AlertDialog.Container placement="center" size="sm">
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Heading>
              {pendingNotice ? "Submitted for review" : title}
            </AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            {pendingNotice ? (
              <InlineAlert status="success">{pendingNotice}</InlineAlert>
            ) : (
              <>
                {description && <p className="text-sm text-muted">{description}</p>}
                {children}
                {error && <InlineAlert>{error}</InlineAlert>}
              </>
            )}
          </AlertDialog.Body>
          <AlertDialog.Footer className="flex justify-end gap-2">
            {pendingNotice ? (
              <Button variant="ghost" onPress={close}>
                Close
              </Button>
            ) : (
              <>
                <Button variant="ghost" onPress={close} isDisabled={isPending}>
                  {cancelLabel}
                </Button>
                <Button
                  variant={tone === "danger" ? "danger" : "primary"}
                  onPress={onConfirm}
                  isDisabled={isPending}
                >
                  {isPending ? "Saving…" : confirmLabel}
                </Button>
              </>
            )}
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
