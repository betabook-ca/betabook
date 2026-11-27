import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, useLocation, useParams, useSearchParams } from "react-router";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { expiredLinkCard } from "@/components/expired-link-card";
import { signUpCard } from "@/components/sign-up-card";
import { TripAlbumPhotos } from "@/components/trips/trip-album";
import { TripDays } from "@/components/trips/trip-days";
import { TripHeader } from "@/components/trips/trip-header";
import { TripList } from "@/components/trips/trip-list";
import { TripNotes } from "@/components/trips/trip-notes";
import { AppLink } from "@/components/ui/app-link";
import { useGradePreferences } from "@/components/ui/grade-preferences";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { PageTitle } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatDate } from "@/lib/format-date";
import { goalToday } from "@/lib/goals";
import { groupTripDays } from "@/lib/trip-days";
import { formatTripDates, tripLogbookHref, tripStatus, TRIP_STATUS_LABEL } from "@/lib/trips";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { usePageTitle } from "@/spa/lib/document-navigation";
import { isNotFoundError } from "@/spa/lib/fetch-json";
import { useRetainedPage } from "@/spa/lib/use-retained-page";
import { useVisitorHeader } from "@/spa/lib/visitor-header";

const Analytics = lazy(() =>
  import("@/components/trips/trip-analytics-view").then((module) => ({
    default: module.TripAnalyticsView,
  })),
);
type TripIndex = ApiResponse<"/api/pages/users/{id}/trips">;
type TripSummary = TripIndex["trips"][number];
type MemberDay = ApiResponse<"/api/pages/users/{id}/trips/{trip}">;
type MemberAnalytics = ApiResponse<"/api/pages/users/{id}/trips/{trip}/analytics">;
type SharedDay = ApiResponse<"/api/pages/trips/{token}">;
type SharedAnalytics = ApiResponse<"/api/pages/trips/{token}/analytics">;
type Detail = MemberDay | MemberAnalytics | Extract<SharedDay | SharedAnalytics, { trip: unknown }>;
type Daily = MemberDay["view"];
type Payload = TripIndex | MemberDay | MemberAnalytics | SharedDay | SharedAnalytics;
type PhotosPage = ApiResponse<"/api/pages/trips/{token}/photos">;

function Photos({
  link,
  token,
  userId,
  tripId,
}: {
  link: string;
  token?: string;
  userId: string;
  tripId: number;
}) {
  const [photos, setPhotos] = useState<PhotosPage>([]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const items = token
          ? await fetchApi("/api/pages/trips/{token}/photos", {
              path: { token },
              signal: controller.signal,
            })
          : await fetchApi("/api/pages/users/{id}/trips/{trip}/photos", {
              path: { id: userId, trip: String(tripId) },
              signal: controller.signal,
            });
        if (!controller.signal.aborted) setPhotos(items);
      } catch {
        // An unreadable album still has its link to Google Photos.
      }
    }
    void load();
    return () => controller.abort();
  }, [token, userId, tripId]);
  return <TripAlbumPhotos link={link} photos={photos} />;
}

function Days({
  trip,
  data,
  userId,
  isOwner,
  token,
  journalVisible,
}: {
  trip: TripSummary;
  data: Daily;
  userId: string;
  isOwner: boolean;
  token?: string;
  journalVisible: boolean;
}) {
  const { days, truncated, partialDate } = groupTripDays({
    startDate: trip.startDate,
    ...data.rows,
  });
  return (
    <section aria-label="Days" className="flex min-w-0 flex-col">
      <TripDays
        heading="Days"
        days={days}
        areaBreadcrumbs={data.breadcrumbs}
        userId={userId}
        isOwner={isOwner}
        forLink={Boolean(token)}
        emptyMessage={
          journalVisible ? "Nothing logged on this trip yet." : "No sends on this trip yet."
        }
        notice={
          truncated && (
            <p>
              {partialDate
                ? formatDate(partialDate) +
                  " has more logged than fits here, so it may be missing some."
                : "Showing the latest days."}
              {!token && (
                <>
                  {" "}
                  Earlier days are in the{" "}
                  {journalVisible && (
                    <>
                      <AppLink href={tripLogbookHref(userId, "journal", trip)}>Journal</AppLink>{" "}
                      and{" "}
                    </>
                  )}
                  <AppLink href={tripLogbookHref(userId, "sends", trip)}>Sends</AppLink>.
                </>
              )}
            </p>
          )
        }
      />
    </section>
  );
}

function hasDays(trip: TripSummary, status: ReturnType<typeof tripStatus>) {
  return trip.sendCount > 0 || (trip.entryCount ?? 0) > 0 || status !== "upcoming";
}

function ownerTripShare(data: Detail, showControls: boolean, isPrivate: boolean) {
  if (!showControls || !("share" in data) || !("rows" in data.view)) return undefined;
  return { share: data.share, origin: window.location.origin, isPrivate };
}

function TripBody({
  data,
  userId,
  viewerId,
  token,
  journalVisible,
  isPrivate,
  analytics,
  loading,
  errorMessage,
}: {
  data: Detail;
  userId: string;
  viewerId: string | null;
  token?: string;
  journalVisible: boolean;
  isPrivate: boolean;
  analytics: boolean;
  loading: boolean;
  errorMessage: string | null;
}) {
  const { view, notes } = data;
  const [search] = useSearchParams();
  const { pathname } = useLocation();
  const gradePreferences = useGradePreferences();
  const today = goalToday(data.timezone ?? "UTC");
  // The shared header uses token routes and never needs the internal trip ID.
  const trip = { ...data.trip, id: "id" in data.trip ? data.trip.id : 0 };
  const owner = !token && viewerId === userId;
  const status = tripStatus(trip, today);
  const badge = TRIP_STATUS_LABEL[status];

  return (
    <TripHeader
      trip={trip}
      userId={userId}
      viewerId={token ? null : viewerId}
      today={today}
      link={token}
      back={analytics ? "trip" : "trips"}
      ownerShare={ownerTripShare(data, owner && !analytics, isPrivate)}
    >
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {loading ? (
        !errorMessage && (
          <div aria-busy="true" aria-label="Loading trip view">
            <SkeletonListRows rows={5} />
          </div>
        )
      ) : "analytics" in view ? (
        <Suspense fallback={<SkeletonListRows rows={5} />}>
          <Analytics
            trip={trip}
            userId={userId}
            sends={view.analytics.sends}
            sessions={view.analytics.sessions}
            gradePreferences={gradePreferences}
            discipline={search.get("discipline") ?? undefined}
            disciplineHref={(scope) => pathname + "?discipline=" + scope}
            shareImage={
              owner
                ? {
                    title: trip.name,
                    description: trip.description,
                    dates: formatTripDates(trip.startDate, trip.endDate),
                    status: badge ? { label: badge.label, tone: badge.color } : null,
                  }
                : undefined
            }
          />
        </Suspense>
      ) : (
        <>
          {trip.albumUrl && (
            <Photos
              key={pathname + trip.albumUrl}
              link={trip.albumUrl}
              token={token}
              userId={userId}
              tripId={trip.id}
            />
          )}
          {(owner || notes) && (
            <TripNotes tripId={owner ? trip.id : undefined} notes={notes} canEdit={owner}>
              {data.notesHtml && (
                // oxlint-disable-next-line react/no-danger -- render_safe_markdown escapes raw HTML and validates every URL in the Worker.
                <div dangerouslySetInnerHTML={{ __html: data.notesHtml }} />
              )}
            </TripNotes>
          )}
          {hasDays(trip, status) && (
            <Days
              trip={trip}
              data={view}
              userId={userId}
              isOwner={owner}
              token={token}
              journalVisible={journalVisible}
            />
          )}
        </>
      )}
    </TripHeader>
  );
}

async function loadTrip(
  id: string | undefined,
  tripId: string | undefined,
  token: string | undefined,
  analytics: boolean,
  signal: AbortSignal,
): Promise<Payload> {
  if (token) {
    return analytics
      ? fetchApi("/api/pages/trips/{token}/analytics", { path: { token }, signal })
      : fetchApi("/api/pages/trips/{token}", { path: { token }, signal });
  }
  const owner = id ?? "";
  if (tripId) {
    const path = { id: owner, trip: tripId };
    return analytics
      ? fetchApi("/api/pages/users/{id}/trips/{trip}/analytics", { path, signal })
      : fetchApi("/api/pages/users/{id}/trips/{trip}", { path, signal });
  }
  return fetchApi("/api/pages/users/{id}/trips", { path: { id: owner }, signal });
}

function tripTitle(data: Payload | undefined) {
  return data && "header" in data
    ? data.header.user.name + " · " + ("trip" in data ? data.trip.name : "Trips")
    : data && "owner" in data
      ? data.owner.name + " · " + data.trip.name
      : null;
}

function tripError(error: unknown) {
  if (!error) return null;
  if (isNotFoundError(error)) return "Trip not found";
  return error instanceof Error ? error.message : "Failed to load trips";
}

export default function TripsRoute({ viewerId }: { viewerId: string | null }) {
  const { token, id, tripId } = useParams();
  const { pathname } = useLocation();
  const analytics = pathname.endsWith("/analytics");
  const scope = token || (viewerId && id) ? JSON.stringify([viewerId, token, id, tripId]) : null;
  const {
    data,
    error,
    query: loadedView,
  } = useRetainedPage<Payload>({
    scope,
    query: analytics ? "analytics" : "detail",
    load: (signal) => loadTrip(id, tripId, token, analytics, signal),
  });
  useVisitorHeader(data ? ("header" in data ? data.header : null) : undefined, error);
  usePageTitle(tripTitle(data));
  if (!token && !viewerId) return <CurrentPageAuthCallout />;
  const message = tripError(error);
  if (!data) return message ? <p role="alert">{message}</p> : <SkeletonListRows rows={5} />;
  const loading = loadedView !== (analytics ? "analytics" : "detail");
  if ("expired" in data) return expiredLinkCard("trips");
  if ("redirectTo" in data) return <Navigate to={data.redirectTo} replace />;
  if ("header" in data)
    return (
      <>
        {"trips" in data && message && <p role="alert">{message}</p>}
        {"trips" in data ? (
          <TripList
            trips={data.trips}
            userId={data.header.user.id}
            canEdit={data.header.isOwner}
            today={goalToday(data.timezone ?? "UTC")}
          />
        ) : (
          <TripBody
            data={data}
            analytics={analytics}
            loading={loading}
            errorMessage={message}
            userId={data.header.user.id}
            viewerId={viewerId}
            journalVisible={data.header.access.journal}
            isPrivate={data.header.user.isPrivate}
          />
        )}
      </>
    );
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar name={data.owner.name} image={data.owner.image} size="lg" />
        <PageTitle className="min-w-0 break-words">
          <AppLink href={"/users/" + data.owner.id}>{data.owner.name}</AppLink>&apos;s trip
        </PageTitle>
      </div>
      <TripBody
        data={data}
        analytics={analytics}
        loading={loading}
        errorMessage={message}
        userId={data.owner.id}
        viewerId={viewerId}
        token={token}
        journalVisible
        isPrivate={false}
      />
      {!viewerId &&
        signUpCard({
          ownerName: data.owner.name,
          path: pathname,
          pitch: "Log your own trips, with every session and send, day by day.",
        })}
    </div>
  );
}
