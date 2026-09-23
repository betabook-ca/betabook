import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader } from "@/app/users/[id]/profile-shell";
import { SendsView } from "@/app/users/[id]/sends-view";
import {
  getTripShareContext,
  resolveTripPage,
  tripMetadata,
  type TripPageParams,
} from "@/app/users/[id]/trips/[tripId]/trip-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { TripHeader } from "@/components/trips/trip-header";
import { parseUserSendsFilter } from "@/lib/filters/user-sends-filter";
import { tripHref } from "@/lib/trips";

export async function generateMetadata({ params }: TripPageParams): Promise<Metadata> {
  const { id, tripId } = await params;
  return tripMetadata(id, tripId);
}

/** The sends dated inside the window. An undated send never appears: a null
 * `date_sent` cannot be shown to fall between two days, and the SQL comparison
 * excludes it without a special case. */
export default async function TripSendsPage({ params, searchParams }: TripPageParams) {
  const [{ id, tripId }, search] = await Promise.all([params, searchParams]);
  const resolved = await resolveTripPage(id, tripId);
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { trip, user } = resolved;
  const { share, shareOrigin } = await getTripShareContext(user.id, trip.id);

  // Same rule as the Journal tab: the trip's dates replace whatever the URL
  // asked for, so the window cannot be widened by hand.
  const filter = {
    ...parseUserSendsFilter(search),
    date: undefined,
    dateFrom: trip.startDate,
    dateTo: trip.endDate,
    datePreset: undefined,
  };

  return (
    <ProfileHeader user={user} viewerId={user.id} workspace="logbook">
      <TripHeader
        trip={trip}
        userId={user.id}
        current="sends"
        share={share}
        shareOrigin={shareOrigin}
      >
        <SendsView
          userId={user.id}
          viewerId={user.id}
          filter={filter}
          basePath={tripHref(user.id, trip.id, "sends")}
          lockedDateRange
        />
      </TripHeader>
    </ProfileHeader>
  );
}
