"use client";

import { Chip } from "@heroui/react";

import type { TripSummary } from "@/db/queries";
import { tripStatus, type TripStatus } from "@/lib/trips";

/** Only upcoming and in-progress trips get a chip. Most trips are in the past,
 * so a chip for those would be on nearly every card.
 *
 * The in-progress chip uses `success`, which is otherwise only used for ascent
 * styles. */
const STATUS_CHIP: Partial<Record<TripStatus, { label: string; color: "success" | "default" }>> = {
  upcoming: { label: "Upcoming", color: "default" },
  current: { label: "On now", color: "success" },
};

export function TripStatusChip({
  trip,
  today,
}: {
  trip: Pick<TripSummary, "startDate" | "endDate">;
  /** Today as `YYYY-MM-DD` in the viewer's timezone, resolved on the server. */
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
