"use client";

import { AlertDialog, Button, Label, TextArea, TextField, useOverlayState } from "@heroui/react";
import { useState, useTransition } from "react";

import { approveChangeRequest, rejectChangeRequest } from "@/actions";
import { InlineAlert } from "@/components/ui/inline-alert";

type ApproveRejectControlsProps = {
  requestId: number;
  /** This admin already approved; the request is waiting on an admin for the
   * remaining area(s). */
  alreadyApproved: boolean;
};

/** Approve records this admin's approval and applies the change once every
 * involved area is covered (see actions/moderation.ts's approveChangeRequest);
 * reject asks for a one-line reason first. Both re-check scope and pending
 * status server-side — this page already only lists reviewable requests, but
 * a second admin could decide the same one in the meantime. */
export function ApproveRejectControls({ requestId, alreadyApproved }: ApproveRejectControlsProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const rejectState = useOverlayState();

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveChangeRequest(requestId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.value.decision === "awaiting") {
        setNotice("Approval recorded — an admin for the remaining area(s) still needs to approve.");
      }
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectChangeRequest(requestId, note);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      rejectState.close();
    });
  }

  function handleRejectOpenChange(isOpen: boolean) {
    // Reset on any close (Esc, overlay, Cancel) so a stale note can't ride
    // along on the next reject.
    if (!isOpen) {
      setNote("");
      setError(null);
    }
    rejectState.setOpen(isOpen);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Button size="sm" onPress={handleApprove} isDisabled={pending || alreadyApproved}>
          {alreadyApproved ? "Approved" : "Approve"}
        </Button>
        <Button size="sm" variant="outline" onPress={rejectState.open} isDisabled={pending}>
          Reject
        </Button>
      </div>
      {notice && <InlineAlert status="success">{notice}</InlineAlert>}
      {error && <InlineAlert>{error}</InlineAlert>}

      <AlertDialog.Backdrop isOpen={rejectState.isOpen} onOpenChange={handleRejectOpenChange}>
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>Reject this request?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <TextField value={note} onChange={setNote}>
                <Label>Reason (shown to the requester)</Label>
                <TextArea placeholder="Optional — why this doesn't work…" />
              </TextField>
            </AlertDialog.Body>
            <AlertDialog.Footer className="flex justify-end gap-2">
              <Button variant="ghost" onPress={rejectState.close} isDisabled={pending}>
                Cancel
              </Button>
              <Button variant="danger" onPress={handleReject} isDisabled={pending}>
                Reject
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
