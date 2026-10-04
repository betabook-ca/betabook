"use client";

import { removeMyJournalTag } from "@/actions";
import { RemovableCompanions } from "@/components/journal/removable-companions";
import type { JournalCompanion } from "@/lib/journal-companions";

export function JournalCompanions({
  entryId,
  initialCompanions,
}: {
  entryId: number;
  initialCompanions?: JournalCompanion[];
}) {
  return (
    <RemovableCompanions
      initialCompanions={initialCompanions}
      remove={() => removeMyJournalTag(entryId)}
    />
  );
}
