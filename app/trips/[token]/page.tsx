import type { Metadata } from "next";
import { Suspense } from "react";

import {
  SharedTripLayout,
  resolveSharedTripPage,
  sharedTripPageMetadata,
  type SharedTripPageProps,
} from "@/app/trips/[token]/shared-trip-shell";
import { tripPhotos } from "@/app/users/[id]/trips/[tripId]/trip-shell";
import { TripDays } from "@/components/trips/trip-days";
import { TripHeader } from "@/components/trips/trip-header";
import { TripNotes } from "@/components/trips/trip-notes";
import { Markdown } from "@/components/ui/markdown";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import {
  getAreaBreadcrumbs,
  getSharedTripEntries,
  getSharedTripSends,
  type TripSummary,
} from "@/db/queries";
import { formatDate } from "@/lib/format-date";
import { TRIP_DAYS_LIMIT, groupTripDays } from "@/lib/trip-days";
import { tripSharePath } from "@/lib/trip-share";
import { tripHref, tripStatus } from "@/lib/trips";

export function generateMetadata(props: SharedTripPageProps): Promise<Metadata> {
  return sharedTripPageMetadata(props);
}

/** A trip link: the trip as its owner's page shows it — album, notes, and a
 * card for each day with its sends and journal entries — without the owner's
 * controls and without links into the Journal and Sends tabs, which the link
 * doesn't open. The counts line still links to the trip's analytics. */
export default async function SharedTripPage(props: SharedTripPageProps) {
  const resolved = await resolveSharedTripPage(props, tripHref);
  if (!resolved.shared) return resolved.expired;
  const { owner, trip, notes, token, signedIn, today } = resolved.shared;
  const showDays =
    trip.sendCount > 0 || (trip.entryCount ?? 0) > 0 || tripStatus(trip, today) !== "upcoming";

  return (
    <SharedTripLayout owner={owner} signedIn={signedIn} path={tripSharePath(token)}>
      <TripHeader trip={trip} userId={owner.id} viewerId={null} today={today} link={token}>
        {tripPhotos(trip)}
        {notes && (
          <TripNotes notes={notes} canEdit={false}>
            <Markdown>{notes}</Markdown>
          </TripNotes>
        )}
        {showDays && (
          <section aria-label="Days" className="flex min-w-0 flex-col">
            <Suspense
              fallback={
                <div className="flex flex-col gap-3">
                  <SectionHeading>Days</SectionHeading>
                  <SkeletonListRows rows={5} />
                </div>
              }
            >
              <SharedTripDays token={token} ownerId={owner.id} trip={trip} />
            </Suspense>
          </section>
        )}
      </TripHeader>
    </SharedTripLayout>
  );
}

/** The owner's day cards, read through the link. Each read re-checks the link
 * and the trip's dates in SQL. */
async function SharedTripDays({
  token,
  ownerId,
  trip,
}: {
  token: string;
  ownerId: string;
  trip: TripSummary;
}) {
  const db = await getDb();
  const [sendsPage, entriesPage] = await Promise.all([
    getSharedTripSends(db, token, ownerId, TRIP_DAYS_LIMIT),
    getSharedTripEntries(db, token, ownerId, TRIP_DAYS_LIMIT),
  ]);
  const { days, truncated, partialDate } = groupTripDays({
    startDate: trip.startDate,
    sends: sendsPage.sends,
    entries: entriesPage.entries,
    sendsCapped: sendsPage.hasMore,
    entriesCapped: entriesPage.hasMore,
  });
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
      userId={ownerId}
      isOwner={false}
      linkTags={false}
      emptyMessage="Nothing logged on this trip yet."
      notice={
        truncated && (
          <p>
            {partialDate
              ? `${formatDate(partialDate)} has more logged than fits here, so it may be missing some.`
              : "Showing the latest days."}
          </p>
        )
      }
    />
  );
}
