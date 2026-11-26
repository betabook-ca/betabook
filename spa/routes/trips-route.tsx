import { lazy, useEffect, useState, type ComponentProps } from "react";
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
import type {
  AnalyticsSendRow,
  AnalyticsSessionRow,
  AreaBreadcrumbs,
  JournalEntry,
  TripSummary,
  UserSendRow,
} from "@/db/queries";
import { formatDate } from "@/lib/format-date";
import { goalToday } from "@/lib/goals";
import type { AlbumPhoto } from "@/lib/trip-album";
import { groupTripDays } from "@/lib/trip-days";
import { formatTripDates, tripLogbookHref, tripStatus, TRIP_STATUS_LABEL } from "@/lib/trips";
import { fetchJson, isNotFoundError } from "@/spa/lib/fetch-json";
import { SpaProfileHeader } from "@/spa/lib/profile-shell";
import { useRouterRefreshKey } from "@/spa/lib/use-refresh-key";

const Analytics = lazy(() =>
  import("@/components/trips/trip-analytics-view").then((module) => ({
    default: module.TripAnalyticsView,
  })),
);
type Header = Omit<ComponentProps<typeof SpaProfileHeader>, "children">;
type Daily = {
  rows: {
    sends: UserSendRow[];
    entries: JournalEntry[];
    sendsCapped: boolean;
    entriesCapped: boolean;
  };
  breadcrumbs: AreaBreadcrumbs;
};
type View = Daily | { analytics: { sends: AnalyticsSendRow[]; sessions?: AnalyticsSessionRow[] } };
type Detail = {
  trip: Omit<TripSummary, "id"> & { id?: number };
  notes: string | null;
  notesHtml: string | null;
  share?: NonNullable<ComponentProps<typeof TripHeader>["ownerShare"]>["share"];
  view: View;
  timezone: string | null;
};
type Payload =
  | { header: Header; trips: TripSummary[]; timezone: string | null }
  | (Detail & { header: Header })
  | (Detail & { owner: { id: string; name: string; image: string | null } })
  | { expired: true }
  | { redirectTo: string };

function Photos({ link, endpoint }: { link: string; endpoint: string }) {
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const items = await fetchJson<AlbumPhoto[]>(endpoint, { signal: controller.signal });
        if (!controller.signal.aborted) setPhotos(items);
      } catch {
        // An unreadable album still has its link to Google Photos.
      }
    }
    void load();
    return () => controller.abort();
  }, [endpoint]);
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

function TripBody({
  data,
  userId,
  viewerId,
  token,
  journalVisible,
  isPrivate,
}: {
  data: Detail;
  userId: string;
  viewerId: string | null;
  token?: string;
  journalVisible: boolean;
  isPrivate: boolean;
}) {
  const { view, notes } = data;
  const [search] = useSearchParams();
  const { pathname } = useLocation();
  const gradePreferences = useGradePreferences();
  const today = goalToday(data.timezone ?? "UTC");
  // The shared header uses token routes and never needs the internal trip ID.
  const trip = { ...data.trip, id: data.trip.id ?? 0 };
  const owner = !token && viewerId === userId;
  const status = tripStatus(trip, today);
  const badge = TRIP_STATUS_LABEL[status];
  const analytics = "analytics" in view;
  return (
    <TripHeader
      trip={trip}
      userId={userId}
      viewerId={token ? null : viewerId}
      today={today}
      link={token}
      back={analytics ? "trip" : "trips"}
      ownerShare={
        owner && !analytics
          ? { share: data.share ?? null, origin: window.location.origin, isPrivate }
          : undefined
      }
    >
      {"analytics" in view ? (
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
      ) : (
        <>
          {trip.albumUrl && (
            <Photos
              key={pathname + trip.albumUrl}
              link={trip.albumUrl}
              endpoint={"/api/pages" + pathname + "/photos"}
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

export default function TripsRoute({ viewerId }: { viewerId: string | null }) {
  const { token } = useParams<{ token: string }>();
  const { pathname } = useLocation();
  const refresh = useRouterRefreshKey();
  const key = JSON.stringify([pathname, viewerId, refresh]);
  const [result, setResult] = useState<
    { key: string; data: Payload } | { key: string; message: string } | null
  >(null);
  useEffect(() => {
    if (!token && !viewerId) return;
    const controller = new AbortController();
    async function load() {
      try {
        const data = await fetchJson<Payload>("/api/pages" + pathname, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setResult({ key, data });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            key,
            message: isNotFoundError(error)
              ? "Trip not found"
              : error instanceof Error
                ? error.message
                : "Failed to load trips",
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [key, pathname, token, viewerId]);
  if (!token && !viewerId) return <CurrentPageAuthCallout />;
  if (result?.key !== key) return <SkeletonListRows rows={5} />;
  if ("message" in result) return <div role="alert">{result.message}</div>;
  const { data } = result;
  if ("expired" in data) return expiredLinkCard("trips");
  if ("redirectTo" in data) return <Navigate to={data.redirectTo} replace />;
  if ("header" in data)
    return (
      <SpaProfileHeader {...data.header}>
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
            userId={data.header.user.id}
            viewerId={viewerId}
            journalVisible={data.header.access.journal}
            isPrivate={data.header.user.isPrivate}
          />
        )}
      </SpaProfileHeader>
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
