"use client";

import { Chip } from "@heroui/react";

import type { TripSummary } from "@/db/queries";
import { tripStatus, type TripStatus } from "@/lib/trips";

/** Only the two statuses worth saying out loud get a chip. "Past" is the
 * ordinary case — most trips are over — so labelling it would put a badge on
 * nearly every card and stop the two that matter from standing out.
 *
 * `success` for a trip happening now is free here: the colour is spoken for by
 * ascent styles elsewhere, and no trip status is an error. */
const STATUS_CHIP: Partial<Record<TripStatus, { label: string; color: "success" | "default" }>> = {
  upcoming: { label: "Upcoming", color: "default" },
  current: { label: "On now", color: "success" },
};

export function TripStatusChip({
  trip,
  today,
}: {
  trip: Pick<TripSummary, "startDate" | "endDate">;
  /** The reader's own `YYYY-MM-DD`, resolved on the server. */
  today: string;
}) {
  const chip = STATUS_CHIP[tripStatus(trip, today)];
  if (!chip) return null;
  return (
    <Chip variant="soft" color={chip.color} size="sm" className="font-sans">
      {chip.label}
    </Chip>
  );
}
