import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { ProfileHeader, profileShareParam } from "@/app/users/[id]/profile-shell";
import {
  resolveTripPage,
  tripMetadata,
  type TripPageParams,
} from "@/app/users/[id]/trips/[tripId]/trip-shell";
import { AnalyticsDashboard, buildStatTiles } from "@/components/analytics-dashboard";
import { AnalyticsLoading } from "@/components/analytics-loading";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { DisciplineScopeNav } from "@/components/discipline-scope-nav";
import { TripHeader } from "@/components/trips/trip-header";
import { TripShareImage } from "@/components/trips/trip-share-image";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/db/client";
import {
  getJournalSessionsForAnalytics,
  getUserSendsForAnalytics,
  type TripSummary,
} from "@/db/queries";
import { buildAnalyticsHighlights } from "@/lib/analytics-highlights";
import { TRIP_ANALYTICS_LAYOUT } from "@/lib/analytics-layout";
import { PROFILE_SHARE_PARAM } from "@/lib/profile-share";
import { getViewerGradePreferences } from "@/lib/session";
import type { ShareStat } from "@/lib/share-image";
import { formatTripDates, TRIP_STATUS_LABEL, tripAnalyticsHref, tripStatus } from "@/lib/trips";
import {
  buildUserAnalytics,
  inDateWindow,
  parseDisciplineScope,
  resolveDisciplineScope,
} from "@/lib/user-analytics";

const NO_YEARS: number[] = [];

export async function generateMetadata({
  params,
  searchParams,
}: TripPageParams): Promise<Metadata> {
  const [{ id, tripId }, search] = await Promise.all([params, searchParams]);
  return tripMetadata(id, tripId, search);
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
  const resolved = await resolveTripPage(id, tripId, search);
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { trip, user, viewerId, today, journalVisible } = resolved;

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
        share={resolved.share ?? undefined}
        back="trip"
      >
        <Suspense fallback={<AnalyticsLoading />}>
          <TripAnalyticsView
            trip={trip}
            userId={user.id}
            viewerId={viewerId}
            today={today}
            journalVisible={journalVisible}
            discipline={typeof search.discipline === "string" ? search.discipline : undefined}
            share={resolved.share}
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
  today,
  journalVisible,
  discipline,
  share,
}: {
  trip: Pick<TripSummary, "id" | "name" | "description" | "startDate" | "endDate">;
  userId: string;
  viewerId: string;
  /** Today as `YYYY-MM-DD` in the viewer's timezone, for the share image's
   * status label. */
  today: string;
  journalVisible: boolean;
  discipline: string | undefined;
  /** Kept on the discipline links, like the header's, for link holders. */
  share: string | null;
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

  const analytics = {
    ...buildUserAnalytics(rows, scope, sessions, NO_YEARS, await getViewerGradePreferences()),
    // A per-month average isn't meaningful for a trip.
    daysPerMonth: null,
  };
  const disciplineNav = (
    <DisciplineScopeNav
      present={present}
      scope={scope}
      href={(type) =>
        `${tripAnalyticsHref(userId, trip.id)}?discipline=${type}` +
        (share ? `&${PROFILE_SHARE_PARAM}=${share}` : "")
      }
    />
  );

  return (
    <AnalyticsDashboard
      activityHeading="Activity on this trip"
      key={`${userId}-${trip.id}`}
      // A fixed layout, not the user's saved one, and not editable here.
      canCustomize={false}
      initialLayout={TRIP_ANALYTICS_LAYOUT}
      analytics={analytics}
      sends={rows}
      // The date filter already excludes undated sends.
      undatedCount={0}
      scope={scope}
      journalVisible={journalVisible}
      selectedYears={NO_YEARS}
      periodPicker={
        viewerId === userId ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {disciplineNav}
            <div className="ml-auto">
              <TripShareImage
                content={shareImageContent(trip, today)}
                stats={shareImageStats(analytics, scope, journalVisible)}
              />
            </div>
          </div>
        ) : (
          disciplineNav
        )
      }
    />
  );
}

function shareImageContent(
  trip: Pick<TripSummary, "name" | "description" | "startDate" | "endDate">,
  today: string,
) {
  const status = TRIP_STATUS_LABEL[tripStatus(trip, today)];
  return {
    title: trip.name,
    status: status ? { label: status.label, tone: status.color } : null,
    dates: formatTripDates(trip.startDate, trip.endDate),
    description: trip.description,
  };
}

/** The page's stat cards as plain strings, so they can cross to the client.
 * Built from the same tiles as the page, with the dashboard's default
 * highlights. */
function shareImageStats(
  analytics: Parameters<typeof buildStatTiles>[0]["analytics"],
  scope: Parameters<typeof buildStatTiles>[0]["scope"],
  journalVisible: boolean,
): ShareStat[] {
  const tiles = buildStatTiles({
    analytics,
    highlights: buildAnalyticsHighlights([], scope, NO_YEARS),
    scope,
    journalVisible,
  });
  return TRIP_ANALYTICS_LAYOUT.cards.map((id) => ({
    id,
    label: tiles[id].label,
    value: plainText(tiles[id].value) ?? "—",
    sub: plainText(tiles[id].sub),
  }));
}

/** Tile values are typed as nodes, but every trip tile uses text or a number. */
function plainText(node: ReactNode): string | null {
  return typeof node === "string" || typeof node === "number" ? String(node) : null;
}
