import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

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
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
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
    return sharedProfileMetadata(shared.owner.name);
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
    const path = withProfileShare(tripHref(owner.id, trip.id), owner.token);
    return (
      <SharedProfileHeader owner={owner} next={path}>
        <SharedTripView owner={owner} trip={trip} path={path} />
      </SharedProfileHeader>
    );
  }
  if (!resolved.ok) notFound();
  const { trip, user, viewerId, today, notesVisible, share } = resolved;

  const isOwner = viewerId === user.id;
  // Owners always get the notes section, so they can add notes.
  const showNotes = notesVisible && (isOwner || Boolean(trip.hasNotes));
  // Only the owner gets the share URL.
  const shareUrl = isOwner ? await getOwnTripShareUrl(await getDb(), user, trip.id) : undefined;
  // Hide the sends section for an upcoming trip with no sends.
  const showSends = trip.sendCount > 0 || tripStatus(trip, today) !== "upcoming";

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
          <Suspense fallback={<Skeleton className="h-32 w-full" />}>
            <TripNotesView
              userId={user.id}
              tripId={trip.id}
              viewerId={viewerId}
              share={share}
              canEdit={isOwner}
            />
          </Suspense>
        )}
        {showSends && (
          <section aria-label="Sends" className="flex min-w-0 flex-col gap-3">
            <SectionHeading>Sends</SectionHeading>
            <Suspense fallback={<SkeletonListRows rows={5} />}>
              <SendsView
                userId={user.id}
                viewerId={viewerId}
                filter={withTripWindow(DEFAULT_USER_SENDS_FILTER, trip)}
                basePath={tripHref(user.id, trip.id)}
                bare
                emptyWindow="No sends on this trip yet."
              />
            </Suspense>
          </section>
        )}
      </TripHeader>
    </ProfileHeader>
  );
}

async function TripNotesView({
  userId,
  tripId,
  viewerId,
  share,
  canEdit,
}: {
  userId: string;
  tripId: number;
  viewerId: string;
  share: string | null;
  canEdit: boolean;
}) {
  const notes = await getTripNotes(await getDb(), userId, tripId, viewerId, share);
  return (
    <TripNotes tripId={tripId} notes={notes} canEdit={canEdit}>
      {notes && <Markdown>{notes}</Markdown>}
    </TripNotes>
  );
}

type SharedTripResolved = NonNullable<Awaited<ReturnType<typeof resolveSharedTrip>>>;

async function SharedTripView({
  owner,
  trip,
  path,
}: SharedTripResolved & {
  path: string;
}) {
  const db = await getDb();
  const [{ sends, areaBreadcrumbs }, notes, today] = await Promise.all([
    // A null viewer only gets comments shared with Everyone.
    getSendsForUserPage(
      db,
      owner.id,
      withTripWindow(DEFAULT_USER_SENDS_FILTER, trip),
      0,
      SHARED_TRIP_SENDS,
      null,
    ).then(async ({ sends }) => ({
      sends,
      areaBreadcrumbs: await getAreaBreadcrumbs(
        db,
        sends.map((send) => send.areaId),
      ),
    })),
    trip.hasNotes ? getTripNotes(db, owner.id, trip.id, null, owner.token) : null,
    tripToday(),
  ]);
  return (
    <SharedTrip
      owner={owner}
      trip={trip}
      sends={sends}
      areaBreadcrumbs={areaBreadcrumbs}
      path={path}
      today={today}
      photos={tripPhotos(trip)}
      notes={
        notes && (
          <TripNotes tripId={trip.id} notes={notes} canEdit={false}>
            <Markdown>{notes}</Markdown>
          </TripNotes>
        )
      }
    />
  );
}
