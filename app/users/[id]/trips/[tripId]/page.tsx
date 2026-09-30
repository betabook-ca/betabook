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
import { Markdown } from "@/components/ui/markdown";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import { getAreaBreadcrumbs, getSendsForUserPage, getTripNotes } from "@/db/queries";
import { DEFAULT_USER_SENDS_FILTER } from "@/lib/filters/user-sends-filter";
import { SHARED_TRIP_SENDS, withProfileShare } from "@/lib/profile-share";
import { getOwnTripShareUrl } from "@/lib/profile-share-url";
import { sharedProfileMetadata } from "@/lib/seo";
import { tripHref, tripStatus } from "@/lib/trips";

export async function generateMetadata({
  params,
  searchParams,
}: TripPageParams): Promise<Metadata> {
  const [{ id, tripId }, search] = await Promise.all([params, searchParams]);
  const shared = await resolveSharedTrip(id, tripId, search);
  // Share link previews show only the user's name, not the trip's.
  if (shared && !(await resolveTripPage(id, tripId, search)).signedIn) {
    return sharedProfileMetadata(shared.owner.name, shared.owner.token);
  }
  return tripMetadata(id, tripId, search);
}

/** Trip page: album, notes, and the sends dated within the trip. Query params
 * are ignored, so the page always shows the whole trip. */
export default async function TripPage({ params, searchParams }: TripPageParams) {
  const [{ id, tripId }, search] = await Promise.all([params, searchParams]);
  const resolved = await resolveTripPage(id, tripId, search);
  if (!resolved.signedIn) {
    const shared = await resolveSharedTrip(id, tripId, search);
    if (!shared) return <CurrentPageAuthCallout />;
    const { owner, trip } = shared;
    const db = await getDb();
    // A null viewer only gets comments shared with Everyone.
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
  // Owners always get the notes section, so they can add notes.
  const showNotes = notesVisible && (isOwner || Boolean(trip.hasNotes));
  const notes = showNotes
    ? await getTripNotes(await getDb(), user.id, trip.id, viewerId, share)
    : null;
  // Hide the sends section for an upcoming trip with no sends.
  const showSends = trip.sendCount > 0 || tripStatus(trip, today) !== "upcoming";
  // Only the owner gets the share URL.
  const shareUrl = isOwner ? await getOwnTripShareUrl(await getDb(), user, trip.id) : undefined;

  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="logbook">
      <TripHeader
        trip={trip}
        userId={user.id}
        viewerId={viewerId}
        today={today}
        shareUrl={shareUrl}
      >
        {tripPhotos(trip)}
        {showNotes && (
          <TripNotes tripId={trip.id} notes={notes} canEdit={isOwner}>
            {notes && <Markdown>{notes}</Markdown>}
          </TripNotes>
        )}
        {showSends && (
          <section aria-label="Sends" className="flex min-w-0 flex-col gap-3">
            <SectionHeading>Sends</SectionHeading>
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
