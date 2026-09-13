"use client";

import { Menu, useOverlayState } from "@heroui/react";
import { clsx } from "clsx";
import { UserCheck } from "lucide-react";
import { useState, useTransition } from "react";

import {
  requestFriendship,
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  removeFriendship,
} from "@/actions";
import { useFriendRequests } from "@/components/friend-requests-provider";
import {
  FriendshipActionButton,
  friendshipConfirmation,
} from "@/components/friendship-action-button";
import { PROFILE_ACTION_CLASS } from "@/components/profile-actions";
import { ActionsMenu } from "@/components/ui/actions-menu";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { ActionResult } from "@/lib/action-result";
import type { FriendshipStatus } from "@/lib/friendships";

type FriendshipMutation = (userId: string) => Promise<ActionResult<FriendshipStatus>>;

/** `profile` keeps an existing friendship's removal in a menu instead of a headline button. */
export function FriendshipButton({
  userId,
  name,
  initialStatus,
  appearance = "row",
}: {
  userId: string;
  name: string;
  initialStatus: FriendshipStatus;
  appearance?: "row" | "profile";
}) {
  const [status, setStatus] = useState(initialStatus);
  const [source, setSource] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { refresh } = useFriendRequests();
  if (source !== initialStatus) {
    setSource(initialStatus);
    setStatus(initialStatus);
  }
  function run(action: FriendshipMutation, complete: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action(userId);
        if (result.ok) {
          setStatus(result.value);
          void refresh();
          complete();
        } else setError(result.error);
      } catch {
        setError("Couldn't save that change. Try again.");
      }
    });
  }
  if (appearance === "profile" && status === "friends") {
    return (
      <FriendMenu
        name={name}
        pending={pending}
        error={error}
        onRemove={(complete) => run(removeFriendship, complete)}
      />
    );
  }
  const options =
    status === "incoming"
      ? [
          { kind: "accept" as const, action: acceptFriendRequest },
          { kind: "decline" as const, action: declineFriendRequest },
        ]
      : status === "outgoing"
        ? [{ kind: "cancel" as const, action: cancelFriendRequest }]
        : status === "friends"
          ? [{ kind: "remove" as const, action: removeFriendship }]
          : [{ kind: "add" as const, action: requestFriendship }];
  return (
    <div
      className={clsx(
        "flex flex-col gap-1",
        appearance === "profile" && "items-start gap-1.5 @2xl:items-end",
      )}
    >
      {status === "outgoing" && (
        <p role="status" className="text-xs text-muted">
          Friend request sent
        </p>
      )}
      {status === "incoming" && appearance === "profile" && (
        <p className="text-sm">{name} sent you a friend request</p>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map(({ kind, action }) => (
          <FriendshipActionButton
            key={kind}
            action={kind}
            name={name}
            pending={pending}
            error={error}
            className={appearance === "profile" ? PROFILE_ACTION_CLASS : undefined}
            onPress={(complete) => run(action, complete)}
          />
        ))}
      </div>
      {error && <InlineAlert className="max-w-64">{error}</InlineAlert>}
    </div>
  );
}

function FriendMenu({
  name,
  pending,
  error,
  onRemove,
}: {
  name: string;
  pending: boolean;
  error: string | null;
  onRemove: (complete: () => void) => void;
}) {
  const state = useOverlayState();
  return (
    <div className="flex items-center gap-1">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium">
        <UserCheck aria-hidden className="size-4 text-success-soft-foreground" />
        Friends
      </span>
      <ActionsMenu
        ariaLabel={`Friendship options for ${name}`}
        triggerClassName="pointer-coarse:size-11"
        onAction={(key) => {
          if (key === "remove") state.open();
        }}
      >
        <Menu.Item id="remove">Remove friend</Menu.Item>
      </ActionsMenu>
      <ConfirmDeleteDialog
        state={state}
        noun="friend"
        {...friendshipConfirmation("remove", name)}
        confirmLabel="Remove friend"
        onConfirm={() => onRemove(state.close)}
        isPending={pending}
        error={error}
      />
    </div>
  );
}
