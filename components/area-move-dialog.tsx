"use client";

import { Button, type UseOverlayStateReturn } from "@heroui/react";
import { useState, useTransition } from "react";

import { AreaPicker, type PickedArea } from "@/components/area-picker";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { GENERIC_ERROR_MESSAGE, type ActionResult } from "@/lib/action-result";
import type { GatedActionResult } from "@/lib/moderation";

/** Choosing where a climb or an area moves to.
 *
 * Searching a tree for a destination is a task, not an urgent question, so
 * this is an ordinary dialog rather than the alert dialog it used to be:
 * `alertdialog` is for an interruption a viewer must answer, and it was
 * wrapping a combobox and a result list inside a 24rem box. The list now
 * gets a column it fits in, and a phone gets the sheet every other picker
 * in the app gets. */
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

  function close() {
    state.close();
    reset();
  }

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
            // "Done", not "Close": the dialog's own close control already
            // carries that label, and two buttons reading Close in one
            // dialog is a coin toss for anyone listening to it.
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
