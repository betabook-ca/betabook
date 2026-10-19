import type { ReactNode } from "react";

import type { ShareLink } from "@/components/share-link-dialog";
import { TripActions } from "@/components/trips/trip-actions";
import { TripBackLink } from "@/components/trips/trip-back-link";
import { TripCompanions } from "@/components/trips/trip-companions";
import { TripShare } from "@/components/trips/trip-share";
import { TripStats } from "@/components/trips/trip-stats";
import { TripStatusChip } from "@/components/trips/trip-status-chip";
import { SectionHeading } from "@/components/ui/typography";
import type { TripSummary } from "@/db/queries";
import { tripShareAnalyticsPath, tripSharePath } from "@/lib/trip-share";
import {
  formatTripDates,
  tripAnalyticsHref,
  tripHref,
  tripLogbookHref,
  tripStatus,
  tripsHref,
} from "@/lib/trips";

/** Header for a trip page: back link, name, dates, description, tagged friends
 * and counts. The counts link to the Journal and Sends tabs filtered to the
 * trip's dates, followed by a link to the trip's analytics. On a trip link's
 * pages (`link`) only the trip and its analytics link to each other. */
export function TripHeader({
  trip,
  userId,
  viewerId,
  today,
  link,
  ownerShare,
  back = "trips",
  children,
}: {
  trip: TripSummary;
  userId: string;
  /** Null for a signed-out visitor with a share link. */
  viewerId: string | null;
  /** Today as `YYYY-MM-DD` in the viewer's timezone, resolved on the server. */
  today: string;
  /** Token of the trip link this page was opened with. Its pages have no
   * trips list to go back to, and the Journal and Sends tabs aren't open to
   * its readers, so only the analytics link and the way back to the trip
   * remain. */
  link?: string;
  /** Owner only: the trip's link as the server last saw it, and the site's
   * origin to build it on. Undefined for everyone else. */
  ownerShare?: { share: ShareLink; origin: string };
  /** Use `trip` on the analytics page, so the back link goes to the trip and
   * the counts don't link to analytics. */
  back?: "trips" | "trip";
  children: ReactNode;
}) {
  const nothingYet =
    tripStatus(trip, today) === "upcoming" && trip.sendCount === 0 && !trip.entryCount;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {back === "trip" ? (
          <TripBackLink href={link ? tripSharePath(link) : tripHref(userId, trip.id)}>
            Back to trip
          </TripBackLink>
        ) : (
          !link && <TripBackLink href={tripsHref(userId)}>All trips</TripBackLink>
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
                {ownerShare && (
                  <TripShare
                    tripId={trip.id}
                    tripName={trip.name}
                    share={ownerShare.share}
                    shareOrigin={ownerShare.origin}
                  />
                )}
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
                link
                  ? { analytics: back === "trip" ? undefined : tripShareAnalyticsPath(link) }
                  : viewerId === null
                    ? undefined
                    : {
                        entries: tripLogbookHref(userId, "journal", trip),
                        sends: tripLogbookHref(userId, "sends", trip),
                        analytics: back === "trip" ? undefined : tripAnalyticsHref(userId, trip.id),
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
