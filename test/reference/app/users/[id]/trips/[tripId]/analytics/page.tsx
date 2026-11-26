import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ProfileHeader } from "@/app/users/[id]/profile-shell";
import {
  resolveTripPage,
  tripMetadata,
  type TripPageParams,
} from "@/app/users/[id]/trips/[tripId]/trip-shell";
import { AnalyticsLoading } from "@/components/analytics-loading";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { TripAnalytics } from "@/components/trips/trip-analytics";
import { TripHeader } from "@/components/trips/trip-header";
import { getDb } from "@/db/client";
import {
  getJournalSessionsForAnalytics,
  getUserSendsForAnalytics,
  type TripSummary,
} from "@/db/queries";
import type { ShareImageContent } from "@/lib/share-image";
import { formatTripDates, TRIP_STATUS_LABEL, tripAnalyticsHref, tripStatus } from "@/lib/trips";

export async function generateMetadata({ params }: TripPageParams): Promise<Metadata> {
  const { id, tripId } = await params;
  return tripMetadata(id, tripId);
}

/** Analytics for one trip, for members the trip audience allows. The whole
 * history is read and `TripAnalytics` filters it to the trip's dates in JS,
 * like the year filter on the main analytics page, so the same queries are
 * reused. */
export default async function TripAnalyticsPage({ params, searchParams }: TripPageParams) {
  const [{ id, tripId }, search] = await Promise.all([params, searchParams]);
  const resolved = await resolveTripPage(id, tripId);
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { trip, user, viewerId, today, journalVisible } = resolved;

  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="logbook">
      <TripHeader trip={trip} userId={user.id} viewerId={viewerId} today={today} back="trip">
        <Suspense fallback={<AnalyticsLoading />}>
          <TripAnalyticsView
            trip={trip}
            userId={user.id}
            viewerId={viewerId}
            journalVisible={journalVisible}
            shareImage={viewerId === user.id ? shareImageContent(trip, today) : undefined}
            discipline={typeof search.discipline === "string" ? search.discipline : undefined}
          />
        </Suspense>
      </TripHeader>
    </ProfileHeader>
  );
}

async function TripAnalyticsView({
  trip,
  userId,
  viewerId,
  journalVisible,
  discipline,
  shareImage,
}: {
  trip: { id: number; startDate: string; endDate: string };
  userId: string;
  viewerId: string;
  journalVisible: boolean;
  discipline: string | undefined;
  /** Owner only: the trip header for the share image. */
  shareImage: Omit<ShareImageContent, "stats"> | undefined;
}) {
  const db = await getDb();
  const [sends, sessions] = await Promise.all([
    getUserSendsForAnalytics(db, userId, viewerId),
    journalVisible ? getJournalSessionsForAnalytics(db, userId, viewerId) : undefined,
  ]);
  return (
    <TripAnalytics
      trip={trip}
      userId={userId}
      sends={sends}
      sessions={sessions}
      discipline={discipline}
      disciplineHref={(type) => `${tripAnalyticsHref(userId, trip.id)}?discipline=${type}`}
      shareImage={shareImage}
    />
  );
}

function shareImageContent(
  trip: Pick<TripSummary, "name" | "description" | "startDate" | "endDate">,
  today: string,
): Omit<ShareImageContent, "stats"> {
  const status = TRIP_STATUS_LABEL[tripStatus(trip, today)];
  return {
    title: trip.name,
    status: status ? { label: status.label, tone: status.color } : null,
    dates: formatTripDates(trip.startDate, trip.endDate),
    description: trip.description,
  };
}
