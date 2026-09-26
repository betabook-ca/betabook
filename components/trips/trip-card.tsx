"use client";

import { Chip } from "@heroui/react";
import type { ReactNode } from "react";

import { TripStats } from "@/components/trips/trip-stats";
import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import type { TripSummary } from "@/db/queries";
import { formatTripDates, tripHref, tripStatus, type TripStatus } from "@/lib/trips";

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

/** One trip in the list. The whole card is not a link: the actions menu lives
 * inside it, and nesting interactive controls inside an anchor is what makes a
 * keyboard user tab into a link they cannot escape. The name is the link. */
export function TripCard({
  trip,
  userId,
  today,
  actions,
}: {
  trip: TripSummary;
  userId: string;
  /** The reader's own `YYYY-MM-DD`, resolved on the server. */
  today: string;
  actions?: ReactNode;
}) {
  const chip = STATUS_CHIP[tripStatus(trip, today)];

  return (
    <li className={`flex flex-col gap-3 ${cardClass("md", "bordered")}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <AppLink href={tripHref(userId, trip.id)} className="font-medium">
              {trip.name}
            </AppLink>
            {chip && (
              <Chip variant="soft" color={chip.color} size="sm" className="font-sans">
                {chip.label}
              </Chip>
            )}
          </div>
          <p className="text-sm text-muted">{formatTripDates(trip.startDate, trip.endDate)}</p>
        </div>
        {actions}
      </div>

      {trip.description && (
        <p className="line-clamp-2 text-sm leading-relaxed">{trip.description}</p>
      )}

      {/* Read through the same SQL the trip's own tabs use, so the card cannot
       * promise a number the page behind it contradicts. */}
      <TripStats trip={trip} />
    </li>
  );
}
