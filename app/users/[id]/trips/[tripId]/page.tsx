import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JournalView } from "@/app/users/[id]/journal-view";
import { ProfileHeader } from "@/app/users/[id]/profile-shell";
import {
  resolveTripPage,
  tripMetadata,
  type TripPageParams,
} from "@/app/users/[id]/trips/[tripId]/trip-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { TripHeader } from "@/components/trips/trip-header";
import { parseJournalFilter } from "@/lib/filters/journal-filter";
import { tripHref } from "@/lib/trips";

export async function generateMetadata({ params }: TripPageParams): Promise<Metadata> {
  const { id, tripId } = await params;
  return tripMetadata(id, tripId);
}

/** The trip's Journal, which is the climber's own journal with the window
 * pinned — the same view, the same reads, a different date range. */
export default async function TripJournalPage({ params, searchParams }: TripPageParams) {
  const [{ id, tripId }, search] = await Promise.all([params, searchParams]);
  const resolved = await resolveTripPage(id, tripId);
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { trip, user } = resolved;

  // The window is applied here, after the rest of the filter is parsed, and
  // the URL's own date parameters are discarded rather than merged. A trip is
  // a claim about two dates; letting `?dateFrom=1900-01-01` through would let
  // anyone widen a trip past what it says it covers just by editing the URL.
  const filter = {
    ...parseJournalFilter(search),
    date: undefined,
    dateFrom: trip.startDate,
    dateTo: trip.endDate,
    datePreset: undefined,
  };

  return (
    <ProfileHeader user={user} viewerId={user.id} workspace="logbook">
      <TripHeader trip={trip} userId={user.id} current="journal">
        <JournalView
          ownerId={user.id}
          viewerId={user.id}
          filter={filter}
          basePath={tripHref(user.id, trip.id)}
          lockedDateRange
        />
      </TripHeader>
    </ProfileHeader>
  );
}
