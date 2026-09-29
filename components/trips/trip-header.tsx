import type { ReactNode } from "react";

import { TripTabs } from "@/components/trips/trip-tabs";
import { AppLink } from "@/components/ui/app-link";
import { SectionHeading } from "@/components/ui/typography";
import type { TripSummary } from "@/db/queries";
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
  current,
  journalVisible,
  children,
}: {
  trip: TripSummary;
  userId: string;
  viewerId: string;
  current: TripTab;
  /** Whether this reader may read the climber's journal, which is what the
   * Journal and Notes tabs show. */
  journalVisible: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <AppLink href={tripsHref(userId)} className="text-sm text-muted">
          ← All trips
        </AppLink>
        {/* A SectionHeading, not a PageTitle: the page around it already emits
         * its only h1, and a second one here would give every trip detail page
         * two — which axe's default rules do not flag, so nothing else would
         * catch it. */}
        <SectionHeading>{trip.name}</SectionHeading>
        {/* The dates and nothing else. A count here would describe the whole
         * window while the Analytics tab counts one discipline, so the two
         * would sit on the same screen disagreeing. Totals live on the list
         * card, where no scoped figure competes with them. */}
        <p className="text-sm text-muted">{formatTripDates(trip.startDate, trip.endDate)}</p>
        {trip.description && <p className="text-sm leading-relaxed">{trip.description}</p>}
      </div>

      <TripTabs
        userId={userId}
        tripId={trip.id}
        current={current}
        showJournal={journalVisible}
        // The owner keeps an empty Notes tab, since that is where they write.
        showNotes={journalVisible && (viewerId === userId || Boolean(trip.hasNotes))}
      />

      {children}
    </div>
  );
}
