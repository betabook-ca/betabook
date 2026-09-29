import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JournalView } from "@/app/users/[id]/journal-view";
import { ProfileHeader } from "@/app/users/[id]/profile-shell";
import { SendsView } from "@/app/users/[id]/sends-view";
import {
  resolveSharedTrip,
  resolveTripPage,
  tripMetadata,
  tripToday,
  withTripWindow,
  type TripPageParams,
} from "@/app/users/[id]/trips/[tripId]/trip-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { SharedTrip } from "@/components/trips/shared-trips";
import { TripHeader } from "@/components/trips/trip-header";
import { getDb } from "@/db/client";
import { getAreaBreadcrumbs, getSendsForUserPage } from "@/db/queries";
import { parseJournalFilter } from "@/lib/filters/journal-filter";
import { DEFAULT_USER_SENDS_FILTER, parseUserSendsFilter } from "@/lib/filters/user-sends-filter";
import { SHARED_TRIP_SENDS, withProfileShare } from "@/lib/profile-share";
import { sharedProfileMetadata } from "@/lib/seo";
import { tripHref } from "@/lib/trips";

export async function generateMetadata({
  params,
  searchParams,
}: TripPageParams): Promise<Metadata> {
  const [{ id, tripId }, search] = await Promise.all([params, searchParams]);
  const shared = await resolveSharedTrip(id, tripId, search);
  // The climber alone, as on their profile: a link pasted into a channel
  // names no trip to the room.
  if (shared && !(await resolveTripPage(id, tripId)).signedIn) {
    return sharedProfileMetadata(shared.owner.name);
  }
  return tripMetadata(id, tripId);
}

/** The climber's journal with the trip's dates pinned, or their sends for a
 * reader the journal is not shared with: the same fallback the profile's own
 * root makes. */
export default async function TripJournalPage({ params, searchParams }: TripPageParams) {
  const [{ id, tripId }, search] = await Promise.all([params, searchParams]);
  const resolved = await resolveTripPage(id, tripId);
  if (!resolved.signedIn) {
    const shared = await resolveSharedTrip(id, tripId, search);
    if (!shared) return <CurrentPageAuthCallout />;
    const { owner, trip } = shared;
    const db = await getDb();
    // A null viewer keeps Members and Friends commentary out of the page.
    const { sends } = await getSendsForUserPage(
      db,
      owner.id,
      withTripWindow(DEFAULT_USER_SENDS_FILTER, trip),
      0,
      SHARED_TRIP_SENDS,
      null,
    );
    const areaBreadcrumbs = await getAreaBreadcrumbs(
      db,
      sends.map((send) => send.areaId),
    );
    return (
      <SharedTrip
        owner={owner}
        trip={trip}
        sends={sends}
        areaBreadcrumbs={areaBreadcrumbs}
        path={withProfileShare(tripHref(owner.id, trip.id), owner.token)}
        today={await tripToday()}
      />
    );
  }
  if (!resolved.ok) notFound();
  const { trip, user, viewerId, today, journalVisible, notesVisible } = resolved;
  const basePath = tripHref(user.id, trip.id);

  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="logbook">
      <TripHeader
        trip={trip}
        userId={user.id}
        viewerId={viewerId}
        today={today}
        current={journalVisible ? "journal" : "sends"}
        journalVisible={journalVisible}
        notesVisible={notesVisible}
      >
        {journalVisible ? (
          <JournalView
            ownerId={user.id}
            viewerId={viewerId}
            filter={withTripWindow(parseJournalFilter(search), trip)}
            basePath={basePath}
            lockedDateRange
            emptyWindow={trip.entryCount === 0 ? "No entries on this trip yet." : undefined}
          />
        ) : (
          <SendsView
            userId={user.id}
            viewerId={viewerId}
            filter={withTripWindow(parseUserSendsFilter(search), trip)}
            basePath={basePath}
            lockedDateRange
            emptyWindow={trip.sendCount === 0 ? "No sends on this trip yet." : undefined}
          />
        )}
      </TripHeader>
    </ProfileHeader>
  );
}
