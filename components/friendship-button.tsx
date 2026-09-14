"use client";

import { Button, Menu, Tooltip, useOverlayState } from "@heroui/react";
import { Clock, UserCheck, UserPlus } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";

import {
  requestFriendship,
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  removeFriendship,
} from "@/actions";
import { FriendRequestDot } from "@/components/friend-request-badge";
import { useFriendRequests } from "@/components/friend-requests-provider";
import {
  FRIENDSHIP_ACTION_LABELS,
  FriendshipActionButton,
  friendshipConfirmation,
  type FriendshipAction,
} from "@/components/friendship-action-button";
import { ActionsMenu } from "@/components/ui/actions-menu";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { ActionResult } from "@/lib/action-result";
import type { FriendshipStatus } from "@/lib/friendships";

type FriendshipMutation = (userId: string) => Promise<ActionResult<FriendshipStatus>>;

const MUTATIONS: Record<FriendshipAction, FriendshipMutation> = {
  add: requestFriendship,
  accept: acceptFriendRequest,
  decline: declineFriendRequest,
  cancel: cancelFriendRequest,
  remove: removeFriendship,
};

const STATUS_ACTIONS: Record<FriendshipStatus, FriendshipAction[]> = {
  none: ["add"],
  incoming: ["accept", "decline"],
  outgoing: ["cancel"],
  friends: ["remove"],
};

const PROFILE_MENUS: Record<
  Exclude<FriendshipStatus, "none">,
  { label: (name: string) => string; tooltip: string; icon: ReactNode }
> = {
  friends: {
    label: (name) => `Friendship options for ${name}`,
    tooltip: "Friends",
    icon: <UserCheck aria-hidden className="size-4 text-success-soft-foreground" />,
  },
  outgoing: {
    label: (name) => `Friend request sent to ${name}`,
    tooltip: "Friend request sent",
    icon: <Clock aria-hidden className="size-4" />,
  },
  incoming: {
    label: (name) => `${name} sent you a friend request`,
    tooltip: "Sent you a friend request",
    icon: (
      <span className="relative">
        <UserPlus aria-hidden className="size-4" />
        <FriendRequestDot className="absolute -top-1 -right-1.5" />
      </span>
    ),
  },
};

const PROFILE_CONTROL_CLASS = "pointer-coarse:size-11";

/** `profile` fits the relationship into one control beside the climber's name. */
export function FriendshipButton({
  userId,
  name,
  initialStatus,
  appearance = "row",
}: {
  userId: string;
  name: string;
  initialStatus: FriendshipStatus;
  appearance?: "row" | "profile" | "menu";
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
  function run(action: FriendshipAction, complete: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await MUTATIONS[action](userId);
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
  if (appearance === "profile" || appearance === "menu") {
    return (
      <ProfileFriendshipControl
        menuIcon={appearance === "menu"}
        status={status}
        name={name}
        pending={pending}
        error={error}
        onAction={run}
      />
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {status === "outgoing" && (
        <p role="status" className="text-xs text-muted">
          Friend request sent
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {STATUS_ACTIONS[status].map((action) => (
          <FriendshipActionButton
            key={action}
            action={action}
            name={name}
            pending={pending}
            error={error}
            onPress={(complete) => run(action, complete)}
          />
        ))}
      </div>
      {error && <InlineAlert className="max-w-64">{error}</InlineAlert>}
    </div>
  );
}

function ProfileFriendshipControl({
  menuIcon,
  status,
  name,
  pending,
  error,
  onAction,
}: {
  menuIcon: boolean;
  status: FriendshipStatus;
  name: string;
  pending: boolean;
  error: string | null;
  onAction: (action: FriendshipAction, complete: () => void) => void;
}) {
  const confirm = useOverlayState();
  const [confirming, setConfirming] = useState<FriendshipAction>("remove");
  const confirmation = friendshipConfirmation(confirming, name);

  function choose(action: FriendshipAction) {
    if (friendshipConfirmation(action, name)) {
      setConfirming(action);
      confirm.open();
    } else onAction(action, () => {});
  }

  return (
    <div className="relative shrink-0">
      {status === "none" ? (
        <Tooltip.Root delay={200}>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label={`${FRIENDSHIP_ACTION_LABELS.add}: ${name}`}
            isDisabled={pending}
            className={`text-link ${PROFILE_CONTROL_CLASS}`}
            onPress={() => choose("add")}
          >
            <UserPlus aria-hidden className="size-4" />
          </Button>
          <Tooltip.Content>{FRIENDSHIP_ACTION_LABELS.add}</Tooltip.Content>
        </Tooltip.Root>
      ) : (
        <ActionsMenu
          ariaLabel={PROFILE_MENUS[status].label(name)}
          tooltip={menuIcon ? "Friendship options" : PROFILE_MENUS[status].tooltip}
          icon={menuIcon ? undefined : PROFILE_MENUS[status].icon}
          triggerClassName={PROFILE_CONTROL_CLASS}
          onAction={(key) => {
            const action = STATUS_ACTIONS[status].find((entry) => entry === key);
            if (action) choose(action);
          }}
        >
          {STATUS_ACTIONS[status].map((action) => (
            <Menu.Item key={action} id={action}>
              {FRIENDSHIP_ACTION_LABELS[action]}
            </Menu.Item>
          ))}
        </ActionsMenu>
      )}
      {confirmation && (
        <ConfirmDeleteDialog
          state={confirm}
          noun={confirming === "remove" ? "friend" : "friend request"}
          {...confirmation}
          confirmLabel={FRIENDSHIP_ACTION_LABELS[confirming]}
          onConfirm={() => onAction(confirming, confirm.close)}
          isPending={pending}
          error={error}
        />
      )}
      {error && !confirm.isOpen && (
        <InlineAlert className="absolute top-full left-0 z-10 mt-1 w-max max-w-64">
          {error}
        </InlineAlert>
      )}
    </div>
  );
}
