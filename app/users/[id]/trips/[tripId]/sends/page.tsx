import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader } from "@/app/users/[id]/profile-shell";
import { SendsView } from "@/app/users/[id]/sends-view";
import {
  resolveTripPage,
  tripMetadata,
  withTripWindow,
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
  const { trip, user, viewerId, journalVisible } = resolved;

  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="logbook">
      <TripHeader
        trip={trip}
        userId={user.id}
        viewerId={viewerId}
        current="sends"
        journalVisible={journalVisible}
      >
        <SendsView
          userId={user.id}
          viewerId={viewerId}
          filter={withTripWindow(parseUserSendsFilter(search), trip)}
          basePath={tripHref(user.id, trip.id, "sends")}
          lockedDateRange
        />
      </TripHeader>
    </ProfileHeader>
  );
}
