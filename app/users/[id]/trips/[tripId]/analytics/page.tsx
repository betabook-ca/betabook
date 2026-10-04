import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ProfileHeader } from "@/app/users/[id]/profile-shell";
import {
  resolveTripPage,
  tripMetadata,
  type TripPageParams,
} from "@/app/users/[id]/trips/[tripId]/trip-shell";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { AnalyticsLoading } from "@/components/analytics-loading";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { DisciplineScopeNav } from "@/components/discipline-scope-nav";
import { TripHeader } from "@/components/trips/trip-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/db/client";
import { getJournalSessionsForAnalytics, getUserSendsForAnalytics } from "@/db/queries";
import { TRIP_ANALYTICS_LAYOUT } from "@/lib/analytics-layout";
import { tripAnalyticsHref } from "@/lib/trips";
import {
  buildUserAnalytics,
  inDateWindow,
  parseDisciplineScope,
  resolveDisciplineScope,
} from "@/lib/user-analytics";

const NO_YEARS: number[] = [];

export async function generateMetadata({ params }: TripPageParams): Promise<Metadata> {
  const { id, tripId } = await params;
  return tripMetadata(id, tripId);
}

/**
 * Analytics for one trip: sends, hardest send, days out, flash rate and the
 * grade pyramid.
 *
 * Rows are filtered to the trip's dates before `buildUserAnalytics` runs, so
 * every stat covers only the trip. Filtering happens in JS, like the year
 * filter on the main analytics page, so the same queries are reused.
 */
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
  const [allSends, allSessions] = await Promise.all([
    getUserSendsForAnalytics(db, userId, viewerId),
    journalVisible ? getJournalSessionsForAnalytics(db, userId, viewerId) : undefined,
  ]);

  const inTrip = (date: string | null) => inDateWindow(date, trip.startDate, trip.endDate);
  const rows = allSends.filter((row) => inTrip(row.dateSent));
  const sessions = allSessions?.filter((entry) => inTrip(entry.entryDate));

  const { present, scope } = resolveDisciplineScope({
    rows,
    sessions,
    requested: parseDisciplineScope(discipline),
  });

  if (scope == null) return <EmptyState message="Nothing logged on this trip yet." />;

  const analytics = buildUserAnalytics(rows, scope, sessions, NO_YEARS);

  return (
    <AnalyticsDashboard
      activityHeading="Activity on this trip"
      key={`${userId}-${trip.id}`}
      // A fixed layout, not the user's saved one, and not editable here.
      canCustomize={false}
      initialLayout={TRIP_ANALYTICS_LAYOUT}
      // A per-month average isn't meaningful for a trip.
      analytics={{ ...analytics, daysPerMonth: null }}
      sends={rows}
      // The date filter already excludes undated sends.
      undatedCount={0}
      scope={scope}
      journalVisible={journalVisible}
      selectedYears={NO_YEARS}
      periodPicker={
        <DisciplineScopeNav
          present={present}
          scope={scope}
          href={(type) => `${tripAnalyticsHref(userId, trip.id)}?discipline=${type}`}
        />
      }
    />
  );
}
