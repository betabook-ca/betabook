"use client";

import { Button, Drawer, Label, TextField } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { useState, useTransition } from "react";

import { requestAreaEdit } from "@/actions";
import { FIELD_CLASS } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PAGE_MAX_WIDTH_CLASS } from "@/components/ui/layout";
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

  function handleOpenChange(isOpen: boolean) {
    state.setOpen(isOpen);
    if (!isOpen) {
      setName(area.name);
      setError(null);
      setPendingNotice(null);
    }
  }

  return (
    <Drawer.Backdrop isOpen={state.isOpen} onOpenChange={handleOpenChange}>
      <Drawer.Content>
        <Drawer.Dialog className={`mx-auto w-full ${PAGE_MAX_WIDTH_CLASS}`}>
          <Drawer.Header>
            <Drawer.Heading>Request a rename</Drawer.Heading>
            <Drawer.CloseTrigger />
          </Drawer.Header>
          <Drawer.Body>
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
                <TextField>
                  <Label>Name</Label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className={FIELD_CLASS}
                  />
                </TextField>

                {error && <InlineAlert>{error}</InlineAlert>}

                <Button type="submit" isDisabled={pending || !trimmedName} fullWidth>
                  Submit rename
                </Button>
              </form>
            )}
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
