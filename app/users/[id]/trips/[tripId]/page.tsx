import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ProfileHeader } from "@/app/users/[id]/profile-shell";
import {
  resolveTripPage,
  tripMetadata,
  tripPhotos,
  withTripWindow,
  type TripPageParams,
} from "@/app/users/[id]/trips/[tripId]/trip-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
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
  getTripShareForOwner,
  type TripSummary,
} from "@/db/queries";
import { getBaseUrl } from "@/lib/app-url";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";
import { DEFAULT_USER_SENDS_FILTER } from "@/lib/filters/user-sends-filter";
import { formatDate } from "@/lib/format-date";
import { TRIP_DAYS_LIMIT, groupTripDays } from "@/lib/trip-days";
import { tripLogbookHref, tripStatus } from "@/lib/trips";

export async function generateMetadata({ params }: TripPageParams): Promise<Metadata> {
  const { id, tripId } = await params;
  return tripMetadata(id, tripId);
}

/** Trip page: album, notes, and a card for each day of the trip with its
 * sends and, for readers of the journal, its journal entries. Only `order` is
 * read from the URL, so the page always shows the whole trip. A signed-out
 * reader needs the trip's own link, at /trips/{token}. */
export default async function TripPage({ params }: TripPageParams) {
  const { id, tripId } = await params;
  const resolved = await resolveTripPage(id, tripId);
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { trip, user, viewerId, today, journalVisible, notesVisible } = resolved;

  const isOwner = viewerId === user.id;
  // Owners always get the notes section, so they can add notes.
  const showNotes = notesVisible && (isOwner || Boolean(trip.hasNotes));
  // Only the owner gets the trip's link: the token is the credential.
  const ownerShare = isOwner
    ? await Promise.all([getTripShareForOwner(await getDb(), user.id, trip.id), getBaseUrl()]).then(
        ([share, origin]) => ({ share, origin }),
      )
    : undefined;
  // Hide the days section for an upcoming trip with nothing logged.
  const showDays =
    trip.sendCount > 0 || (trip.entryCount ?? 0) > 0 || tripStatus(trip, today) !== "upcoming";

  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="logbook">
      <TripHeader
        trip={trip}
        userId={user.id}
        viewerId={viewerId}
        today={today}
        ownerShare={ownerShare}
      >
        {tripPhotos(trip)}
        {showNotes && (
          <Suspense fallback={<Skeleton className="h-32 w-full" />}>
            <TripNotesView
              userId={user.id}
              tripId={trip.id}
              viewerId={viewerId}
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
  canEdit,
}: {
  userId: string;
  tripId: number;
  viewerId: string;
  canEdit: boolean;
}) {
  const notes = await getTripNotes(await getDb(), userId, tripId, viewerId);
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
