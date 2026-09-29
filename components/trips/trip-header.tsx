import type { ReactNode } from "react";

import { TripActions } from "@/components/trips/trip-actions";
import { TripBackLink } from "@/components/trips/trip-back-link";
import { TripCompanions } from "@/components/trips/trip-companions";
import { TripStatusChip } from "@/components/trips/trip-status-chip";
import { TripTabs } from "@/components/trips/trip-tabs";
import { SectionHeading } from "@/components/ui/typography";
import type { TripSummary } from "@/db/queries";
import { withProfileShare } from "@/lib/profile-share";
import { formatTripDates, tripsHref, type TripTab } from "@/lib/trips";

/** The trip above its views: what it is, when it was, and the way back.
 *
 * The date range is stated here rather than repeated in each tab, because it
 * is the one fact they all have in common — every number below is derived
 * from it. The tabs themselves carry no date control for the same reason. */
export function TripHeader({
  trip,
  userId,
  viewerId,
  today,
  current,
  journalVisible,
  notesVisible,
  share,
  children,
}: {
  trip: TripSummary;
  userId: string;
  /** Null for the signed-out holder of the climber's profile link. */
  viewerId: string | null;
  /** The reader's own `YYYY-MM-DD`, resolved on the server. */
  today: string;
  current: TripTab;
  /** Whether this reader may read the climber's journal, which is what the
   * Journal tab shows. */
  journalVisible: boolean;
  /** Whether this reader is the climber or a friend of theirs, who the notes
   * are for. */
  notesVisible: boolean;
  /** The profile link a signed-out reader holds, which the way back needs. */
  share?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <TripBackLink href={share ? withProfileShare(tripsHref(userId), share) : tripsHref(userId)}>
          All trips
        </TripBackLink>
        {/* A SectionHeading, not a PageTitle: the page around it already emits
         * its only h1, and a second one here would give every trip detail page
         * two — which axe's default rules do not flag, so nothing else would
         * catch it. */}
        {/* The menu sits beside the whole block, as on the card, so its height
         * never sets the space under the name. */}
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <SectionHeading className="min-w-0 break-words">{trip.name}</SectionHeading>
              <TripStatusChip trip={trip} today={today} />
            </div>
            {/* The dates and nothing else. A count here would describe the
             * whole window while the Analytics tab counts one discipline, so
             * the two would sit on the same screen disagreeing. Totals live on
             * the list card, where no scoped figure competes with them. */}
            <p className="text-sm text-muted">{formatTripDates(trip.startDate, trip.endDate)}</p>
            {trip.description && <p className="text-sm leading-relaxed">{trip.description}</p>}
            <TripCompanions tripId={trip.id} initialCompanions={trip.companions} />
          </div>
          {viewerId === userId && <TripActions trip={trip} userId={userId} leaveOnDelete />}
        </div>
      </div>

      {/* The link opens one view of a trip, so there is nothing to choose between. */}
      {viewerId !== null && (
        <TripTabs
          userId={userId}
          tripId={trip.id}
          current={current}
          showJournal={journalVisible}
          // The owner keeps an empty Notes tab, since that is where they write.
          showNotes={notesVisible && (viewerId === userId || Boolean(trip.hasNotes))}
        />
      )}

      {children}
    </div>
  );
}
