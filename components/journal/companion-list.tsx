"use client";

import { Button } from "@heroui/react";

import { AppLink } from "@/components/ui/app-link";
import { InlineAlert } from "@/components/ui/inline-alert";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { JournalCompanion } from "@/lib/journal-companions";

const NO_COMPANIONS: JournalCompanion[] = [];

/** Pure display: callers own mutation state; stories and tutorials use local callbacks. */
export function CompanionList({
  companions = NO_COMPANIONS,
  onRemoveSelf,
  pending = false,
  error,
  profileLinks = true,
}: {
  companions?: JournalCompanion[];
  onRemoveSelf?: () => void;
  pending?: boolean;
  error?: string | null;
  profileLinks?: boolean;
}) {
  if (companions.length === 0) return null;
  return (
    <div className="flex w-full min-w-0 flex-col gap-1 text-xs text-muted">
      {/* A wrapping row rather than a sentence: each companion is a face and a
       * name together, so the pair must never break across lines. */}
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 break-words">
        With{" "}
        {companions.map((friend, index) => (
          <span key={friend.id} className="inline-flex min-w-0 items-center gap-1">
            <UserAvatar name={friend.name} image={friend.image} size="xs" className="size-5" />
            {profileLinks ? (
              <AppLink href={`/users/${friend.id}`} className="text-xs">
                {friend.name}
              </AppLink>
            ) : (
              friend.name
            )}
            {index < companions.length - 1 && ","}
          </span>
        ))}
      </p>
      {onRemoveSelf && companions.some((friend) => friend.isSelf) && (
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          isDisabled={pending}
          onPress={onRemoveSelf}
        >
          {pending ? "Removing…" : "Remove my tag"}
        </Button>
      )}
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}
