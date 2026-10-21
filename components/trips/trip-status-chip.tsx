"use client";

import { Chip } from "@heroui/react";

import type { TripSummary } from "@/db/queries";
import { TRIP_STATUS_LABEL, tripStatus } from "@/lib/trips";

export function TripStatusChip({
  trip,
  today,
}: {
  trip: Pick<TripSummary, "startDate" | "endDate">;
  /** Today as `YYYY-MM-DD` in the viewer's timezone, resolved on the server. */
  today: string;
}) {
  const chip = TRIP_STATUS_LABEL[tripStatus(trip, today)];
  if (!chip) return null;
  return (
    <Chip variant="soft" color={chip.color} size="sm" className="font-sans">
      {chip.label}
    </Chip>
  );
}
