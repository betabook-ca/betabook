"use client";

import { Button } from "@heroui/react";
import { useState } from "react";

import { ClimberListItem } from "@/components/friends/climber-list-item";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { SuggestedClimberRow } from "@/lib/community-types";
import { formatCount } from "@/lib/format";

/** Friendship actions refresh the page without the climber just requested, so rows stay as first shown. */
export function FriendSuggestions({ climbers }: { climbers: SuggestedClimberRow[] }) {
  const [shown] = useState(climbers);
  const [expanded, setExpanded] = useState(false);
  if (!shown.length) return null;
  return (
    <section aria-label="You may know" className="flex w-full min-w-0 flex-col gap-2">
      <Eyebrow as="h2">You may know</Eyebrow>
      <div className="grid gap-x-8 lg:grid-cols-2">
        {(expanded ? shown : shown.slice(0, 3)).map((climber) => (
          <ClimberListItem
            key={climber.id}
            climber={climber}
            detail={formatCount(climber.mutualFriendCount, "mutual friend")}
          />
        ))}
      </div>
      {shown.length > 3 && (
        <Button
          variant="ghost"
          size="sm"
          className="self-end"
          onPress={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </section>
  );
}
