"use client";

import { Button } from "@heroui/react";
import { useState, useTransition } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";
import { GENERIC_ERROR_MESSAGE, type ActionResult } from "@/lib/action-result";
import type { GatedActionResult } from "@/spa/lib/action-contracts";

/** A catalog change that applies at once for an admin and otherwise waits in
 * the review queue. */
type ReviewedChange = ActionResult<GatedActionResult>;

/** The submit, error and queued-notice state shared by every drawer that
 * requests a catalog change. `queuedNotice` explains what happens until an
 * admin approves; `onApplied` runs when the change took effect at once, unless
 * the submit passes its own. */
export function useReviewRequest({
  queuedNotice,
  onApplied,
}: {
  queuedNotice: string;
  onApplied?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(send: () => Promise<ReviewedChange>, applied = onApplied) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await send();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (result.value.status === "pending") {
          setNotice(queuedNotice);
          return;
        }
        applied?.();
      } catch {
        setError(GENERIC_ERROR_MESSAGE);
      }
    });
  }

  function reset() {
    setError(null);
    setNotice(null);
  }

  return { pending, error, notice, submit, reset };
}

/** Replaces a request drawer's form once the change is queued: leaving the
 * form enabled invites a second click and a duplicate request. */
export function ReviewQueuedNotice({ notice, onDone }: { notice: string; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <InlineAlert status="success" title="Submitted for review">
        {notice}
      </InlineAlert>
      <Button variant="ghost" onPress={onDone} fullWidth>
        Done
      </Button>
    </div>
  );
}
