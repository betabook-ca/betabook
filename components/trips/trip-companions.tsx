"use client";

import { removeMyTripTag } from "@/actions";
import { RemovableCompanions } from "@/components/journal/removable-companions";
import type { JournalCompanion } from "@/lib/journal-companions";

export function TripCompanions({
  tripId,
  initialCompanions,
}: {
  tripId: number;
  initialCompanions: JournalCompanion[];
}) {
  return (
    <RemovableCompanions
      initialCompanions={initialCompanions}
      remove={() => removeMyTripTag(tripId)}
    />
  );
}
