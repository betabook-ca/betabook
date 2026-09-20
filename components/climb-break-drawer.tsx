"use client";

import { Button, Label, TextArea, TextField } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { requestClimbBreak } from "@/actions";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { Climb } from "@/db/queries";
import { composeClimbBreakTexts, MAX_BREAK_REASON_LENGTH } from "@/lib/broken-climbs";

type ClimbBreakDrawerProps = {
  climb: Climb;
  state: UseOverlayStateReturn;
};

/** Reports that a climb broke on a date — gated like every other structural
 * change (see actions/moderation.ts's requestClimbBreak): applied at once for
 * an admin covering the area, otherwise queued for review. The successor's
 * name and both descriptions are composed from the climb as it is now and
 * shown here verbatim, since that exact text is what the request carries. */
export function ClimbBreakDrawer({ climb, state }: ClimbBreakDrawerProps) {
  const router = useRouter();
  const today = new Intl.DateTimeFormat("en-CA").format(new Date());

  const [brokenOn, setBrokenOn] = useState(today);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmedReason = reason.trim();
  const preview =
    brokenOn && trimmedReason
      ? composeClimbBreakTexts(climb, { brokenOn, reason: trimmedReason })
      : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPendingNotice(null);
    if (!brokenOn || !trimmedReason) return;

    const formData = new FormData();
    formData.set("brokenOn", brokenOn);
    formData.set("reason", trimmedReason);

    startTransition(async () => {
      const result = await requestClimbBreak(climb.id, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.value.status === "pending") {
        setPendingNotice(
          "Submitted for admin review — the climb stays as it is until an admin approves the report.",
        );
        return;
      }
      state.close();
      router.refresh();
    });
  }

  function reset() {
    setBrokenOn(today);
    setReason("");
    setError(null);
    setPendingNotice(null);
  }

  return (
    <ResponsiveDialog state={state} title="Report as broken" isPending={pending} onClose={reset}>
      {pendingNotice ? (
        // Swap the form out once queued — a second click would only
        // trip the one-pending-request rule.
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">{pendingNotice}</p>
          <Button variant="ghost" onPress={state.close} fullWidth>
            Close
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Once approved, only ascents dated before the break can be logged on this climb, its
            description gains a note, and a new climb is created for the post-break line at the same
            grade. Sends and sessions already dated on or after the break move to the new climb.
          </p>

          <DatePickerField
            label="Date it broke"
            value={brokenOn}
            max={today}
            onChange={setBrokenOn}
          />

          <TextField
            value={reason}
            onChange={setReason}
            isRequired
            maxLength={MAX_BREAK_REASON_LENGTH}
          >
            <Label>What happened</Label>
            <TextArea rows={3} placeholder="The crux flake came off in the spring thaw." />
          </TextField>

          {preview && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-muted">
                New climb: <span className="text-foreground">{preview.successorName}</span>
              </p>
              <p className="text-muted">
                Added to this climb&rsquo;s description:{" "}
                <span className="text-foreground">
                  {preview.appendedDescription.slice(
                    climb.description ? climb.description.length + 2 : 0,
                  )}
                </span>
              </p>
              <p className="text-muted">
                New climb&rsquo;s description:{" "}
                <span className="text-foreground">{preview.successorDescription}</span>
              </p>
            </div>
          )}

          {error && <InlineAlert>{error}</InlineAlert>}

          <Button type="submit" isDisabled={pending || !brokenOn || !trimmedReason} fullWidth>
            Report as broken
          </Button>
        </form>
      )}
    </ResponsiveDialog>
  );
}
