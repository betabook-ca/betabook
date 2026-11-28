"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { useState } from "react";

import { ReviewQueuedNotice, useReviewRequest } from "@/components/climbs/review-request";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { Area } from "@/lib/catalog-types";
import { requestAreaEdit } from "@/spa/lib/actions-client";

type AreaEditRequestDrawerProps = {
  area: Area;
  state: UseOverlayStateReturn;
};

/** A rename — the one gated area edit, behind admin approval. The description isn't here:
 * updateArea (the description pencil) already lets any signed-in user edit
 * it instantly. */
export function AreaEditRequestDrawer({ area, state }: AreaEditRequestDrawerProps) {
  const [name, setName] = useState(area.name);
  const request = useReviewRequest({
    queuedNotice: "Submitted for admin review — this won't take effect until it's approved.",
    onApplied: state.close,
  });

  const trimmedName = name.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmedName) return;
    const formData = new FormData();
    formData.set("name", trimmedName);
    request.submit(() => requestAreaEdit(area.id, formData));
  }

  function reset() {
    setName(area.name);
    request.reset();
  }

  return (
    <ResponsiveDialog
      state={state}
      title="Request a rename"
      isPending={request.pending}
      onClose={reset}
    >
      {request.notice ? (
        // Swap the whole form out once the request is queued — leaving
        // it enabled invites a second click and a duplicate request.
        <ReviewQueuedNotice notice={request.notice} onDone={state.close} />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <TextField value={name} onChange={setName} isRequired>
            <Label>Name</Label>
            <Input />
          </TextField>

          {request.error && <InlineAlert>{request.error}</InlineAlert>}

          <Button type="submit" isDisabled={request.pending || !trimmedName} fullWidth>
            Submit rename
          </Button>
        </form>
      )}
    </ResponsiveDialog>
  );
}
