import type { ReactNode } from "react";

import { TripActions } from "@/components/trips/trip-actions";
import { TripBackLink } from "@/components/trips/trip-back-link";
import { TripCompanions } from "@/components/trips/trip-companions";
import { TripShare } from "@/components/trips/trip-share";
import { TripStats } from "@/components/trips/trip-stats";
import { TripStatusChip } from "@/components/trips/trip-status-chip";
import { SectionHeading } from "@/components/ui/typography";
import type { TripSummary } from "@/db/queries";
import { withProfileShare } from "@/lib/profile-share";
import { formatTripDates, tripHref, tripLogbookHref, tripStatus, tripsHref } from "@/lib/trips";

/** The trip over its page: what it is, when it was, what it holds, and the
 * way back.
 *
 * A trip is one page with no views to choose between. It lists its sends,
 * and each count opens the Journal or Sends under the trip's dates, where a
 * climber already filters. */
export function TripHeader({
  trip,
  userId,
  viewerId,
  today,
  share,
  shareUrl,
  back = "trips",
  children,
}: {
  trip: TripSummary;
  userId: string;
  /** Null for the signed-out holder of the climber's profile link. */
  viewerId: string | null;
  /** The reader's own `YYYY-MM-DD`, resolved on the server. */
  today: string;
  /** The profile link a signed-out reader holds, which the way back needs. */
  share?: string;
  /** The owner's profile link opened on this trip, null while their profile
   * is private. Left out for every other reader. */
  shareUrl?: string | null;
  /** `trip` on the trip's analytics, which leads back to the trip. */
  back?: "trips" | "trip";
  children: ReactNode;
}) {
  const trips = share ? withProfileShare(tripsHref(userId), share) : tripsHref(userId);
  const nothingYet =
    tripStatus(trip, today) === "upcoming" && trip.sendCount === 0 && !trip.entryCount;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {back === "trip" ? (
          <TripBackLink href={tripHref(userId, trip.id)}>Back to trip</TripBackLink>
        ) : (
          <TripBackLink href={trips}>All trips</TripBackLink>
        )}
        {/* A SectionHeading, not a PageTitle: the page around it already emits
         * its only h1, and a second one here would give every trip detail page
         * two — which axe's default rules do not flag, so nothing else would
         * catch it. */}
        {/* The buttons share a row with the name alone, so the lines under it
         * keep the full width, and give up their height to that row, so they
         * never set the space under the name. */}
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <SectionHeading className="min-w-0 break-words">{trip.name}</SectionHeading>
              <TripStatusChip trip={trip} today={today} />
            </div>
            {viewerId === userId && (
              <div className="-my-1 flex shrink-0 items-center gap-1">
                {shareUrl !== undefined && <TripShare tripName={trip.name} url={shareUrl} />}
                <TripActions trip={trip} userId={userId} leaveOnDelete />
              </div>
            )}
          </div>
          <p className="text-sm text-muted">{formatTripDates(trip.startDate, trip.endDate)}</p>
          {trip.description && <p className="text-sm leading-relaxed">{trip.description}</p>}
          <TripCompanions tripId={trip.id} initialCompanions={trip.companions} />
          {/* The chip already says a trip is still to come. */}
          {!nothingYet && (
            <TripStats
              trip={trip}
              // The Logbook is behind sign-in.
              links={
                viewerId === null
                  ? undefined
                  : {
                      entries: tripLogbookHref(userId, "journal", trip),
                      sends: tripLogbookHref(userId, "sends", trip),
                    }
              }
            />
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
