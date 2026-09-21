"use client";

import { Button, type UseOverlayStateReturn } from "@heroui/react";
import { useState, useTransition } from "react";

import { AreaPicker, type PickedArea } from "@/components/area-picker";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { GENERIC_ERROR_MESSAGE, type ActionResult } from "@/lib/action-result";
import type { GatedActionResult } from "@/lib/moderation";

/** Picking where a climb or area moves to.
 *
 * This was an AlertDialog, which is the wrong role — `alertdialog` is for
 * interruptions the viewer has to answer, not for searching a tree. It also
 * meant a combobox and its results squeezed into 24rem. Now it's a normal
 * dialog: a wider column on desktop, a sheet on phones like every other
 * picker. */
export function AreaMoveDialog({
  state,
  title,
  pendingMessage,
  onMove,
}: {
  state: UseOverlayStateReturn;
  title: string;
  pendingMessage: string;
  onMove: (areaId: number) => Promise<ActionResult<GatedActionResult>>;
}) {
  const [picked, setPicked] = useState<PickedArea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setPicked(null);
    setError(null);
    setQueued(false);
  }

  // The dialog runs `reset` once its exit has finished, so closing from the
  // body only has to close.
  const close = state.close;

  function move() {
    if (!picked || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await onMove(picked.id);
        if (!result.ok) setError(result.error);
        else if (result.value.status === "pending") setQueued(true);
        else close();
      } catch {
        setError(GENERIC_ERROR_MESSAGE);
      }
    });
  }

  return (
    <ResponsiveDialog
      state={state}
      title={queued ? "Submitted for review" : title}
      size="lg"
      isPending={pending}
      onClose={reset}
      footer={
        <div className="flex justify-end gap-2">
          {queued ? (
            // "Done" rather than "Close", because the dialog's own close
            // button already uses that label.
            <Button variant="ghost" onPress={close}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onPress={close} isDisabled={pending}>
                Cancel
              </Button>
              <Button onPress={move} isDisabled={pending || !picked}>
                Move
              </Button>
            </>
          )}
        </div>
      }
    >
      {queued ? (
        <p className="text-sm text-muted">{pendingMessage}</p>
      ) : (
        <fieldset disabled={pending} className="flex min-w-0 flex-col gap-3">
          <AreaPicker
            selected={picked}
            onSelectedChange={(area) => {
              if (!pending) setPicked(area);
            }}
          />
          {error && <InlineAlert>{error}</InlineAlert>}
        </fieldset>
      )}
    </ResponsiveDialog>
  );
}
