"use client";

import { Button, useOverlayState } from "@heroui/react";
import { useState, useTransition } from "react";

import { removeProfilePhoto } from "@/actions";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

/** Removing the photo clears the stored pointer and deletes an uploaded
 * object, so it confirms through the app's one delete dialog like any other
 * irreversible action. */
export function RemoveProfilePhotoButton() {
  const confirmState = useOverlayState();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await removeProfilePhoto();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // The row itself disappears once the server components re-render
        // without a photo; closing keeps the dialog from outliving it.
        confirmState.close();
      } catch {
        setError("Couldn't remove your photo. Try again.");
      }
    });
  }

  return (
    <>
      <Button variant="outline" onPress={confirmState.open}>
        Remove photo
      </Button>
      <ConfirmDeleteDialog
        noun="photo"
        state={confirmState}
        title="Remove your profile photo?"
        description="Your initials will show instead. This can't be undone — an uploaded photo is deleted, and signing in with Google again won't bring that photo back."
        confirmLabel="Remove"
        onConfirm={handleConfirm}
        isPending={isPending}
        error={error}
      />
    </>
  );
}
