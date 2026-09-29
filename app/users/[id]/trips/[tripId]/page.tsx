import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JournalView } from "@/app/users/[id]/journal-view";
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
import { parseJournalFilter } from "@/lib/filters/journal-filter";
import { parseUserSendsFilter } from "@/lib/filters/user-sends-filter";
import { tripHref } from "@/lib/trips";

export async function generateMetadata({ params }: TripPageParams): Promise<Metadata> {
  const { id, tripId } = await params;
  return tripMetadata(id, tripId);
}

/** The climber's journal with the trip's dates pinned, or their sends for a
 * reader the journal is not shared with: the same fallback the profile's own
 * root makes. */
export default async function TripJournalPage({ params, searchParams }: TripPageParams) {
  const [{ id, tripId }, search] = await Promise.all([params, searchParams]);
  const resolved = await resolveTripPage(id, tripId);
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { trip, user, viewerId, journalVisible } = resolved;
  const basePath = tripHref(user.id, trip.id);

  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="logbook">
      <TripHeader
        trip={trip}
        userId={user.id}
        viewerId={viewerId}
        current={journalVisible ? "journal" : "sends"}
        journalVisible={journalVisible}
      >
        {journalVisible ? (
          <JournalView
            ownerId={user.id}
            viewerId={viewerId}
            filter={withTripWindow(parseJournalFilter(search), trip)}
            basePath={basePath}
            lockedDateRange
          />
        ) : (
          <SendsView
            userId={user.id}
            viewerId={viewerId}
            filter={withTripWindow(parseUserSendsFilter(search), trip)}
            basePath={basePath}
            lockedDateRange
          />
        )}
      </TripHeader>
    </ProfileHeader>
  );
}
