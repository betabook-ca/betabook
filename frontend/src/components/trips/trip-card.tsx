"use client";

import type { ReactNode } from "react";

import { TripCompanions } from "@/components/trips/trip-companions";
import { TripStats } from "@/components/trips/trip-stats";
import { TripStatusChip } from "@/components/trips/trip-status-chip";
import { IndexCard } from "@/components/ui/index-card";
import type { TripSummary } from "@/lib/logbook-types";
import { formatTripDates, tripHref } from "@/lib/trips";

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
  const href = tripHref(userId, trip.id);

  return (
    <IndexCard
      title={trip.name}
      href={href}
      badge={<TripStatusChip trip={trip} today={today} />}
      summary={formatTripDates(trip.startDate, trip.endDate)}
      actions={actions}
      description={trip.description}
    >
      <TripCompanions tripId={trip.id} initialCompanions={trip.companions} />

      {/* Read through the same SQL the trip's own tabs use, so the card cannot
       * promise a number the page behind it contradicts. */}
      <TripStats trip={trip} />
    </IndexCard>
  );
}
