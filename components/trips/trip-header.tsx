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

/** Header for a trip page: back link, name, dates, description, tagged friends
 * and counts. The counts link to the Journal and Sends tabs filtered to the
 * trip's dates. */
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
  /** Null for a signed-out visitor with a share link. */
  viewerId: string | null;
  /** Today as `YYYY-MM-DD` in the viewer's timezone, resolved on the server. */
  today: string;
  /** Share token for a signed-out visitor, added to the back link. */
  share?: string;
  /** Owner only: share URL for this trip, or null if the profile is private.
   * Undefined for everyone else. */
  shareUrl?: string | null;
  /** Use `trip` on the analytics page, so the back link goes to the trip. */
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
        {/* Uses SectionHeading, not PageTitle. The page already has an h1, and
         * axe's default rules don't flag a second one. */}
        {/* Only the name shares a row with the buttons, so the lines below use
         * the full width. The negative margin keeps the buttons from adding
         * height to that row. */}
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
          {/* Hide counts for an upcoming trip with nothing logged. */}
          {!nothingYet && (
            <TripStats
              trip={trip}
              // Signed-out visitors can't open the Logbook, so counts aren't
              // links.
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
