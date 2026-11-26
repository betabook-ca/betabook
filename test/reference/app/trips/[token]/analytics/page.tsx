import type { Metadata } from "next";
import { Suspense } from "react";

import {
  SharedTripLayout,
  resolveSharedTripPage,
  sharedTripPageMetadata,
  type SharedTripPageProps,
} from "@/app/trips/[token]/shared-trip-shell";
import { AnalyticsLoading } from "@/components/analytics-loading";
import { TripAnalytics } from "@/components/trips/trip-analytics";
import { TripHeader } from "@/components/trips/trip-header";
import { getDb } from "@/db/client";
import {
  getSharedTripAnalyticsSends,
  getSharedTripAnalyticsSessions,
  type TripSummary,
} from "@/db/queries";
import { tripShareAnalyticsPath } from "@/lib/trip-share";
import { tripAnalyticsHref } from "@/lib/trips";

export function generateMetadata(props: SharedTripPageProps): Promise<Metadata> {
  return sharedTripPageMetadata(props);
}

/** A trip link's analytics: the owner's trip analytics, sessions included,
 * read through the link. */
export default async function SharedTripAnalyticsPage(props: SharedTripPageProps) {
  const [resolved, search] = await Promise.all([
    resolveSharedTripPage(props, tripAnalyticsHref),
    props.searchParams,
  ]);
  if (!resolved.shared) return resolved.expired;
  const { owner, trip, token, signedIn, today } = resolved.shared;

  return (
    <SharedTripLayout owner={owner} signedIn={signedIn} path={tripShareAnalyticsPath(token)}>
      <TripHeader
        trip={trip}
        userId={owner.id}
        viewerId={null}
        today={today}
        link={token}
        back="trip"
      >
        <Suspense fallback={<AnalyticsLoading />}>
          <SharedTripAnalytics
            token={token}
            ownerId={owner.id}
            trip={trip}
            discipline={typeof search.discipline === "string" ? search.discipline : undefined}
          />
        </Suspense>
      </TripHeader>
    </SharedTripLayout>
  );
}

async function SharedTripAnalytics({
  token,
  ownerId,
  trip,
  discipline,
}: {
  token: string;
  ownerId: string;
  trip: TripSummary;
  discipline: string | undefined;
}) {
  const db = await getDb();
  const [sends, sessions] = await Promise.all([
    getSharedTripAnalyticsSends(db, token, ownerId),
    getSharedTripAnalyticsSessions(db, token, ownerId),
  ]);
  return (
    <TripAnalytics
      trip={trip}
      userId={ownerId}
      sends={sends}
      sessions={sessions}
      discipline={discipline}
      disciplineHref={(type) => `${tripShareAnalyticsPath(token)}?discipline=${type}`}
    />
  );
}
