"use client";

import type { ReactNode } from "react";

import { TripCompanions } from "@/components/trips/trip-companions";
import { TripStats } from "@/components/trips/trip-stats";
import { TripStatusChip } from "@/components/trips/trip-status-chip";
import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import type { TripSummary } from "@/db/queries";
import { withProfileShare } from "@/lib/profile-share";
import { formatTripDates, tripHref } from "@/lib/trips";

/** One trip in the list. The whole card is not a link: the actions menu lives
 * inside it, and nesting interactive controls inside an anchor is what makes a
 * keyboard user tab into a link they cannot escape. The name is the link. */
export function TripCard({
  trip,
  userId,
  today,
  actions,
  shareToken,
}: {
  trip: TripSummary;
  userId: string;
  /** The reader's own `YYYY-MM-DD`, resolved on the server. */
  today: string;
  actions?: ReactNode;
  /** The climber's profile link, which a signed-out reader's next page needs. */
  shareToken?: string;
}) {
  const href = tripHref(userId, trip.id);

  return (
    <li className={`flex flex-col gap-3 ${cardClass("sm", "bordered")}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <AppLink
              href={shareToken ? withProfileShare(href, shareToken) : href}
              className="font-medium"
            >
              {trip.name}
            </AppLink>
            <TripStatusChip trip={trip} today={today} />
          </div>
          <p className="text-sm text-muted">{formatTripDates(trip.startDate, trip.endDate)}</p>
        </div>
        {actions}
      </div>

      {trip.description && (
        <p className="line-clamp-2 text-sm leading-relaxed">{trip.description}</p>
      )}

      <TripCompanions tripId={trip.id} initialCompanions={trip.companions} />

      {/* Read through the same SQL the trip's own tabs use, so the card cannot
       * promise a number the page behind it contradicts. */}
      <TripStats trip={trip} />
    </li>
  );
}
