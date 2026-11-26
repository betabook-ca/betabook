"use client";

import { RemovableCompanions } from "@/components/journal/removable-companions";
import type { JournalCompanion } from "@/lib/journal-companions";
import { removeMyJournalTag } from "@/spa/lib/actions-client";

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
