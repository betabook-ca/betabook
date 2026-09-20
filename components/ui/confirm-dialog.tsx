"use client";

import { AlertDialog, Button } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import type { ReactNode } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";

type ConfirmDialogProps = {
  state: UseOverlayStateReturn;
  title: string;
  description?: string;
  /** One field the viewer fills in before confirming, like a reason or a
   * date. More than one and this is really a form — use ResponsiveDialog. */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` for anything that destroys or rejects. */
  tone?: "danger" | "default";
  onConfirm: () => void;
  isPending: boolean;
  /** Failure from the last attempt, shown inline so the viewer can retry
   * or cancel. */
  error?: string | null;
  /** Set instead of closing when the action was queued for admin review
   * rather than applied. Replaces the confirm/cancel footer with a single
   * acknowledgement, since nothing has happened yet. */
  pendingNotice?: string | null;
  /** Runs after close by any route (Cancel, Escape, backdrop). Use it to
   * clear `children` and any error, so they don't reappear next time. */
  onClose?: () => void;
};

/** The shared confirmation: a centered alert dialog at every width.
 *
 * Not responsive, on purpose. A sheet is a lot of chrome for one sentence
 * and two buttons, and swiping it away is the wrong gesture for settling a
 * destructive choice. Routing every delete, reject and gate through here
 * also keeps the wording, button order and danger styling consistent.
 *
 * If it contains a form, use ResponsiveDialog instead. */
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
