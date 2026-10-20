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
import { getJournalSessionsForAnalytics, getUserSendsForAnalytics } from "@/db/queries";
import { tripAnalyticsHref } from "@/lib/trips";

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
}: {
  trip: { id: number; startDate: string; endDate: string };
  userId: string;
  viewerId: string;
  journalVisible: boolean;
  discipline: string | undefined;
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
    />
  );
}
