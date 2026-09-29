import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader, SharedProfileHeader } from "@/app/users/[id]/profile-shell";
import { SendsView } from "@/app/users/[id]/sends-view";
import {
  resolveSharedTrip,
  resolveTripPage,
  tripMetadata,
  tripPhotos,
  tripToday,
  withTripWindow,
  type TripPageParams,
} from "@/app/users/[id]/trips/[tripId]/trip-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { SharedTrip } from "@/components/trips/shared-trips";
import { TripHeader } from "@/components/trips/trip-header";
import { TripNotes } from "@/components/trips/trip-notes";
import { AppLink } from "@/components/ui/app-link";
import { Markdown } from "@/components/ui/markdown";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import { getAreaBreadcrumbs, getSendsForUserPage, getTripNotes } from "@/db/queries";
import { DEFAULT_USER_SENDS_FILTER } from "@/lib/filters/user-sends-filter";
import { SHARED_TRIP_SENDS, withProfileShare } from "@/lib/profile-share";
import { sharedProfileMetadata } from "@/lib/seo";
import { tripAnalyticsHref, tripHref, tripStatus } from "@/lib/trips";

export async function generateMetadata({
  params,
  searchParams,
}: TripPageParams): Promise<Metadata> {
  const [{ id, tripId }, search] = await Promise.all([params, searchParams]);
  const shared = await resolveSharedTrip(id, tripId, search);
  // The climber alone, as on their profile: a link pasted into a channel
  // names no trip to the room.
  if (shared && !(await resolveTripPage(id, tripId, search)).signedIn) {
    return sharedProfileMetadata(shared.owner.name);
  }
  return tripMetadata(id, tripId, search);
}

/** A trip, on one page: its album, its notes for the climber's friends and
 * whoever holds their profile link, and the sends dated inside it. The URL filters nothing here, so a trip means
 * one thing; the entries are in the Journal, under the trip's dates. */
export default async function TripPage({ params, searchParams }: TripPageParams) {
  const [{ id, tripId }, search] = await Promise.all([params, searchParams]);
  const resolved = await resolveTripPage(id, tripId, search);
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
    const path = withProfileShare(tripHref(owner.id, trip.id), owner.token);
    const notes = trip.hasNotes
      ? await getTripNotes(db, owner.id, trip.id, null, owner.token)
      : null;
    return (
      <SharedProfileHeader owner={owner} next={path}>
        <SharedTrip
          owner={owner}
          trip={trip}
          sends={sends}
          areaBreadcrumbs={areaBreadcrumbs}
          path={path}
          today={await tripToday()}
          photos={tripPhotos(trip)}
          notes={
            notes && (
              <TripNotes tripId={trip.id} notes={notes} canEdit={false}>
                <Markdown>{notes}</Markdown>
              </TripNotes>
            )
          }
        />
      </SharedProfileHeader>
    );
  }
  if (!resolved.ok) notFound();
  const { trip, user, viewerId, today, notesVisible, share } = resolved;

  const isOwner = viewerId === user.id;
  // The owner keeps an empty section, since that is where they write.
  const showNotes = notesVisible && (isOwner || Boolean(trip.hasNotes));
  const notes = showNotes
    ? await getTripNotes(await getDb(), user.id, trip.id, viewerId, share)
    : null;
  // The chip already says a trip is still to come.
  const showSends = trip.sendCount > 0 || tripStatus(trip, today) !== "upcoming";
  const logged = trip.sendCount > 0 || Boolean(trip.entryCount);

  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="logbook">
      <TripHeader trip={trip} userId={user.id} viewerId={viewerId} today={today}>
        {tripPhotos(trip)}
        {showNotes && (
          <TripNotes tripId={trip.id} notes={notes} canEdit={isOwner}>
            {notes && <Markdown>{notes}</Markdown>}
          </TripNotes>
        )}
        {showSends && (
          <section aria-label="Sends" className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <SectionHeading>Sends</SectionHeading>
              {logged && (
                <AppLink href={tripAnalyticsHref(user.id, trip.id)} className="text-sm">
                  Analytics
                </AppLink>
              )}
            </div>
            <SendsView
              userId={user.id}
              viewerId={viewerId}
              filter={withTripWindow(DEFAULT_USER_SENDS_FILTER, trip)}
              basePath={tripHref(user.id, trip.id)}
              bare
              emptyWindow="No sends on this trip yet."
            />
          </section>
        )}
      </TripHeader>
    </ProfileHeader>
  );
}
