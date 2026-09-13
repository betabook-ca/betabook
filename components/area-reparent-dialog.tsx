"use client";

import { AlertDialog, Button } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { useState, useTransition } from "react";

import { requestAreaReparent } from "@/actions";
import { AreaPicker, type PickedArea } from "@/components/area-picker";
import { InlineAlert } from "@/components/ui/inline-alert";

type AreaReparentDialogProps = {
  areaId: number;
  state: UseOverlayStateReturn;
};

/** Lets a viewer change which area an area sits under. Gated the same as any
 * other structural change (see actions/moderation.ts): applies immediately
 * for an admin, otherwise queues a change request and says so instead of
 * closing as if the area had already moved. A parent that would create a
 * cycle (itself, or one of its own sub-areas) is rejected server-side with a
 * friendly message rather than filtered out of the picker. The admin path
 * needs no navigation callback — applyAreaReparent's refresh() re-renders
 * the page in place. */
export function AreaReparentDialog({ areaId, state }: AreaReparentDialogProps) {
  const [picked, setPicked] = useState<PickedArea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    if (!picked) return;
    setError(null);
    startTransition(async () => {
      const result = await requestAreaReparent(areaId, picked.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.value.status === "pending") {
        setPendingNotice("An admin needs to approve this before the area actually moves.");
        return;
      }
      state.close();
    });
  }

  function handleOpenChange(isOpen: boolean) {
    state.setOpen(isOpen);
    if (!isOpen) {
      setPicked(null);
      setError(null);
      setPendingNotice(null);
    }
  }

  return (
    <AlertDialog.Backdrop isOpen={state.isOpen} onOpenChange={handleOpenChange}>
      <AlertDialog.Container placement="center" size="sm">
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Heading>
              {pendingNotice ? "Submitted for review" : "Change parent area"}
            </AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            {pendingNotice ? (
              <p className="text-sm text-muted">{pendingNotice}</p>
            ) : (
              <div className="flex flex-col gap-3">
                <AreaPicker selected={picked} onSelectedChange={setPicked} />
                {error && <InlineAlert>{error}</InlineAlert>}
              </div>
            )}
          </AlertDialog.Body>
          <AlertDialog.Footer className="flex justify-end gap-2">
            {pendingNotice ? (
              <Button variant="ghost" onPress={state.close}>
                Close
              </Button>
            ) : (
              <>
                <Button variant="ghost" onPress={state.close} isDisabled={pending}>
                  Cancel
                </Button>
                <Button onPress={handleConfirm} isDisabled={pending || !picked}>
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
