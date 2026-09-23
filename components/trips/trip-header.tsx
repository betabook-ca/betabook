import type { ReactNode } from "react";

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
  children,
}: {
  trip: TripSummary;
  userId: string;
  current: TripTab;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <AppLink href={tripsHref(userId)} className="text-sm text-muted">
          ← All trips
        </AppLink>
        <SectionHeading>{trip.name}</SectionHeading>
        {/* The dates and nothing else. A count here would be the trip's
         * whole window, while the Analytics tab counts one discipline at a
         * time — so the two would sit on the same screen disagreeing about
         * "days out". The list card, where no scoped figure competes with it,
         * is where the totals belong. */}
        <p className="text-sm text-muted">{formatTripDates(trip.startDate, trip.endDate)}</p>
        {trip.description && <p className="text-sm leading-relaxed">{trip.description}</p>}
      </div>

      <TripTabs userId={userId} tripId={trip.id} current={current} />

      {children}
    </div>
  );
}
