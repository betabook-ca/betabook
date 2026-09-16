"use client";

import { Button, useOverlayState } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { GENERIC_ERROR_MESSAGE } from "@/lib/action-result";
import { authClient } from "@/lib/auth-client";

export function DeleteAccountButton() {
  const router = useRouter();
  const deleteState = useOverlayState();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setPending(true);
    try {
      await authClient.deleteUser({
        fetchOptions: {
          onSuccess: () => {
            router.push("/");
            router.refresh();
          },
          onError: (ctx) => setError(ctx.error.message ?? "Could not delete your account"),
          onResponse: () => setPending(false),
        },
      });
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="danger" onPress={deleteState.open}>
        Delete account
      </Button>
      <ConfirmDeleteDialog
        noun="account"
        state={deleteState}
        onConfirm={handleDelete}
        isPending={pending}
        error={error}
      />
    </>
  );
}
