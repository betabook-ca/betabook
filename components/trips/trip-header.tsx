import type { ReactNode } from "react";

import type { TripShare } from "@/components/trips/share-trip-dialog";
import { TripShareControls } from "@/components/trips/trip-share-controls";
import { TripTabs } from "@/components/trips/trip-tabs";
import { AppLink } from "@/components/ui/app-link";
import { SectionHeading } from "@/components/ui/typography";
import type { TripSummary } from "@/db/queries";
import { formatTripDates, tripsHref, type TripTab } from "@/lib/trips";

/** The trip above its three views: what it is, when it was, and the way back.
 *
 * The date range is stated here rather than repeated in each tab, because it
 * is the one fact all three have in common — every number below is derived
 * from it. The tabs themselves carry no date control for the same reason. */
export function TripHeader({
  trip,
  userId,
  current,
  share,
  shareOrigin,
  children,
}: {
  trip: TripSummary;
  userId: string;
  current: TripTab;
  /** The trip's link as the server last saw it, or null when not shared. */
  share: TripShare;
  /** Resolved on the server so the copyable URL is the same string before and
   * after hydration, and points at a preview deployment when that is where
   * the climber is. */
  shareOrigin: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <AppLink href={tripsHref(userId)} className="text-sm text-muted">
          ← All trips
        </AppLink>
        {/* A SectionHeading, not a PageTitle: WorkspaceSection already emits
         * the page's only h1 ("Trips · Logbook", screen-reader only), and a
         * second one here would give every trip detail page two — which axe's
         * default rules do not flag, so nothing else would catch it. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading>{trip.name}</SectionHeading>
          <TripShareControls
            tripId={trip.id}
            tripName={trip.name}
            share={share}
            shareOrigin={shareOrigin}
          />
        </div>
        {/* The dates and nothing else. A count here would describe the whole
         * window while the Analytics tab counts one discipline, so the two
         * would sit on the same screen disagreeing. Totals live on the list
         * card, where no scoped figure competes with them. */}
        <p className="text-sm text-muted">{formatTripDates(trip.startDate, trip.endDate)}</p>
        {trip.description && <p className="text-sm leading-relaxed">{trip.description}</p>}
      </div>

      <TripTabs userId={userId} tripId={trip.id} current={current} />

      {children}
    </div>
  );
}
