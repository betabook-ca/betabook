import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  ProfileHeader,
  SharedProfileHeader,
  profileShareParam,
} from "@/app/users/[id]/profile-shell";
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
import { TripDays } from "@/components/trips/trip-days";
import { TripHeader } from "@/components/trips/trip-header";
import { TripNotes } from "@/components/trips/trip-notes";
import { AppLink } from "@/components/ui/app-link";
import { Markdown } from "@/components/ui/markdown";
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import {
  getAreaBreadcrumbs,
  getJournalPage,
  getSendsForUserPage,
  getTripNotes,
  type TripSummary,
} from "@/db/queries";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";
import { DEFAULT_USER_SENDS_FILTER } from "@/lib/filters/user-sends-filter";
import { formatDate } from "@/lib/format-date";
import { SHARED_TRIP_SENDS, withProfileShare } from "@/lib/profile-share";
import { getOwnTripShareUrl } from "@/lib/profile-share-url";
import { sharedProfileMetadata } from "@/lib/seo";
import { groupTripDays } from "@/lib/trip-days";
import { tripHref, tripLogbookHref, tripStatus } from "@/lib/trips";

/** Most sends, and most journal entries, the trip page reads. Trips have no
 * length limit, so a longer one shows its latest days and links to the Journal
 * and Sends tabs for the rest. */
const TRIP_DAYS_LIMIT = 300;

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

/** Trip page: album, notes, and a card for each day of the trip with its
 * sends and, for readers of the journal, its journal entries. Only `order`
 * and the share token are read from the URL, so the page always shows the
 * whole trip. */
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
  const { trip, user, viewerId, today, journalVisible, notesVisible, share } = resolved;

  const isOwner = viewerId === user.id;
  // Owners always get the notes section, so they can add notes.
  const showNotes = notesVisible && (isOwner || Boolean(trip.hasNotes));
  // Only the owner gets the share URL.
  const shareUrl = isOwner ? await getOwnTripShareUrl(await getDb(), user, trip.id) : undefined;
  // Hide the days section for an upcoming trip with nothing logged.
  const showDays =
    trip.sendCount > 0 || (trip.entryCount ?? 0) > 0 || tripStatus(trip, today) !== "upcoming";

  return (
    <ProfileHeader
      user={user}
      viewerId={viewerId}
      share={profileShareParam(search)}
      workspace="logbook"
    >
      <TripHeader
        trip={trip}
        userId={user.id}
        viewerId={viewerId}
        today={today}
        shareUrl={shareUrl}
        share={share ?? undefined}
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
        {showDays && (
          <section aria-label="Days" className="flex min-w-0 flex-col">
            <Suspense
              fallback={
                // Shaped like TripDays, so the heading stays put when the days arrive.
                <div className="flex flex-col gap-3">
                  <SectionHeading>Days</SectionHeading>
                  <SkeletonListRows rows={5} />
                </div>
              }
            >
              <TripDaysView
                trip={trip}
                userId={user.id}
                viewerId={viewerId}
                journalVisible={journalVisible}
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

async function TripDaysView({
  trip,
  userId,
  viewerId,
  journalVisible,
}: {
  trip: TripSummary;
  userId: string;
  viewerId: string;
  /** Entries are read only for viewers of the journal. The query checks
   * access again in SQL. */
  journalVisible: boolean;
}) {
  const db = await getDb();
  const [sendsPage, entriesPage] = await Promise.all([
    getSendsForUserPage(
      db,
      userId,
      withTripWindow(DEFAULT_USER_SENDS_FILTER, trip),
      0,
      TRIP_DAYS_LIMIT,
      viewerId,
    ),
    journalVisible
      ? getJournalPage(
          db,
          userId,
          viewerId,
          withTripWindow(DEFAULT_JOURNAL_FILTER, trip),
          null,
          TRIP_DAYS_LIMIT,
        )
      : { entries: [], hasMore: false },
  ]);
  const { sends } = sendsPage;
  const { entries } = entriesPage;
  const { days, truncated, partialDate } = groupTripDays({
    startDate: trip.startDate,
    sends,
    entries,
    sendsCapped: sendsPage.hasMore,
    entriesCapped: entriesPage.hasMore,
  });
  // Only the rows that survived the cut need their area paths.
  const areaBreadcrumbs = await getAreaBreadcrumbs(
    db,
    days.flatMap((day) =>
      day.items.flatMap((item) => {
        const areaId = item.kind === "send" ? item.send.areaId : item.entry.areaId;
        return areaId == null ? [] : [areaId];
      }),
    ),
  );
  return (
    <TripDays
      heading="Days"
      days={days}
      areaBreadcrumbs={areaBreadcrumbs}
      userId={userId}
      isOwner={viewerId === userId}
      emptyMessage={
        journalVisible ? "Nothing logged on this trip yet." : "No sends on this trip yet."
      }
      notice={
        truncated && (
          <p>
            {partialDate
              ? `${formatDate(partialDate)} has more logged than fits here, so it may be missing some. Everything is in the `
              : "Showing the latest days. Earlier days are in the "}
            {journalVisible && (
              <>
                <AppLink href={tripLogbookHref(userId, "journal", trip)}>Journal</AppLink> and{" "}
              </>
            )}
            <AppLink href={tripLogbookHref(userId, "sends", trip)}>Sends</AppLink>{" "}
            {journalVisible ? "tabs" : "tab"}.
          </p>
        )
      }
    />
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
  const [{ sends, hasMore, areaBreadcrumbs }, notes, today] = await Promise.all([
    // A null viewer only gets comments shared with Everyone.
    getSendsForUserPage(
      db,
      owner.id,
      withTripWindow(DEFAULT_USER_SENDS_FILTER, trip),
      0,
      SHARED_TRIP_SENDS,
      null,
    ).then(async ({ sends, hasMore }) => ({
      sends,
      hasMore,
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
      sendsCapped={hasMore}
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
