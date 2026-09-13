"use client";

import { Button, useOverlayState } from "@heroui/react";

import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

type FriendshipAction = "add" | "accept" | "decline" | "cancel" | "remove";

const LABELS: Record<FriendshipAction, string> = {
  add: "Add friend",
  accept: "Accept request",
  decline: "Decline request",
  cancel: "Cancel request",
  remove: "Remove friend",
};

export function friendshipConfirmation(action: FriendshipAction, name: string) {
  return action === "remove"
    ? {
        title: `Remove ${name} as a friend?`,
        description:
          "Their activity will leave your feed, and you'll both lose access to Friends-only journal entries and send notes. Tags between you on journal entries are permanently removed.",
        cancelLabel: "Keep friend",
      }
    : action === "decline"
      ? {
          title: `Decline ${name}'s friend request?`,
          description: "This removes the request. They can send you another one later.",
          cancelLabel: "Keep request",
        }
      : action === "cancel"
        ? {
            title: `Cancel your friend request to ${name}?`,
            description:
              "They won't be able to accept this request. You can send another one later.",
            cancelLabel: "Keep request",
          }
        : null;
}

/** Shared by real relationships and local tour examples. Call complete only after success. */
export function FriendshipActionButton({
  action,
  name,
  onPress,
  pending = false,
  error,
}: {
  action: FriendshipAction;
  name: string;
  onPress: (complete: () => void) => void;
  pending?: boolean;
  error?: string | null;
}) {
  const state = useOverlayState();
  const label = LABELS[action];
  const confirmation = friendshipConfirmation(action, name);
  return (
    <>
      <Button
        size="sm"
        variant={confirmation ? "secondary" : "primary"}
        isDisabled={pending}
        aria-label={`${label}: ${name}`}
        onPress={() => {
          if (confirmation) state.open();
          else onPress(state.close);
        }}
      >
        {pending ? "Saving…" : label}
      </Button>
      {confirmation && (
        <ConfirmDeleteDialog
          state={state}
          noun="friend request"
          {...confirmation}
          confirmLabel={label}
          onConfirm={() => onPress(state.close)}
          isPending={pending}
          error={error}
        />
      )}
    </>
  );
}
