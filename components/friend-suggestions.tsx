"use client";

import { useState } from "react";

import { ClimberListItem } from "@/components/climber-list-item";
import { SectionHeading } from "@/components/ui/typography";
import type { SuggestedClimberRow } from "@/db/queries";
import { formatCount } from "@/lib/format";

/** Friendship actions refresh the page without the climber just requested, so rows stay as first shown. */
export function FriendSuggestions({ climbers }: { climbers: SuggestedClimberRow[] }) {
  const [shown] = useState(climbers);
  if (!shown.length) return null;
  return (
    <section aria-label="You may know" className="flex w-full min-w-0 flex-col gap-2">
      <SectionHeading>You may know</SectionHeading>
      <div className="grid gap-x-8 lg:grid-cols-2">
        {shown.map((climber) => (
          <ClimberListItem
            key={climber.id}
            climber={climber}
            detail={formatCount(climber.mutualFriendCount, "mutual friend")}
          />
        ))}
      </div>
    </section>
  );
}
