"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { useState, useTransition } from "react";

import { requestAreaEdit } from "@/actions";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { Area } from "@/db/queries";

type AreaEditRequestDrawerProps = {
  area: Area;
  state: UseOverlayStateReturn;
};

/** A rename — the one gated area edit, behind admin approval (see
 * actions/moderation.ts's requestAreaEdit). The description isn't here:
 * updateArea (the description pencil) already lets any signed-in user edit
 * it instantly. */
export function AreaEditRequestDrawer({ area, state }: AreaEditRequestDrawerProps) {
  const [name, setName] = useState(area.name);
  const [error, setError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmedName = name.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPendingNotice(null);
    if (!trimmedName) return;

    const formData = new FormData();
    formData.set("name", trimmedName);

    startTransition(async () => {
      const result = await requestAreaEdit(area.id, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.value.status === "pending") {
        setPendingNotice(
          "Submitted for admin review — this won't take effect until it's approved.",
        );
        return;
      }
      state.close();
    });
  }

  function reset() {
    setName(area.name);
    setError(null);
    setPendingNotice(null);
  }

  return (
    <ResponsiveDialog state={state} title="Request a rename" isPending={pending} onClose={reset}>
      {pendingNotice ? (
        // Swap the whole form out once the request is queued — leaving
        // it enabled invites a second click and a duplicate request.
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">{pendingNotice}</p>
          <Button variant="ghost" onPress={state.close} fullWidth>
            Close
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <TextField value={name} onChange={setName} isRequired>
            <Label>Name</Label>
            <Input />
          </TextField>

          {error && <InlineAlert>{error}</InlineAlert>}

          <Button type="submit" isDisabled={pending || !trimmedName} fullWidth>
            Submit rename
          </Button>
        </form>
      )}
    </ResponsiveDialog>
  );
}
