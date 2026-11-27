"use client";

import { RemovableCompanions } from "@/components/journal/removable-companions";
import type { JournalCompanion } from "@/lib/journal-companions";
import { removeMyTripTag } from "@/spa/lib/actions-client";

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
