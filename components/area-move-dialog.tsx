"use client";

import { AlertDialog, Button, type UseOverlayStateReturn } from "@heroui/react";
import { useState, useTransition } from "react";

import { AreaPicker, type PickedArea } from "@/components/area-picker";
import { InlineAlert } from "@/components/ui/inline-alert";
import { GENERIC_ERROR_MESSAGE, type ActionResult } from "@/lib/action-result";
import type { GatedActionResult } from "@/lib/moderation";

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

  function close() {
    state.close();
    setPicked(null);
    setError(null);
    setQueued(false);
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
    <AlertDialog.Backdrop
      isOpen={state.isOpen}
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <AlertDialog.Container placement="center" size="sm">
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Heading>{queued ? "Submitted for review" : title}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
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
          </AlertDialog.Body>
          <AlertDialog.Footer className="flex justify-end gap-2">
            {queued ? (
              <Button variant="ghost" onPress={close}>
                Close
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
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
