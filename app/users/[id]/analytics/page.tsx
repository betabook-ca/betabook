import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  ProfileHeader,
  canReadUserJournal,
  memberMetadata,
  resolveProfilePage,
} from "@/app/users/[id]/profile-shell";
import { AnalyticsLoading } from "@/components/analytics-loading";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import {
  EmptyProfileAnalytics,
  ProfileAnalyticsDashboard,
} from "@/components/profile-analytics-view";
import { getDb } from "@/db/client";
import { getJournalSessionsForAnalytics, getUserSendsForAnalytics } from "@/db/queries";
import { getAnalyticsHighlightSessions } from "@/db/queries/analytics-highlights";
import { getAnalyticsLayout } from "@/db/queries/analytics-layout";
import { getClimberOverview } from "@/db/queries/climber-overview";
import { getViewerFeatureAnnouncements } from "@/db/queries/feature-announcements";
import { getUserHashtags } from "@/db/queries/hashtag-filter";
import {
  ANALYTICS_CUSTOMIZE_ANNOUNCEMENT,
  getAnnouncementCandidates,
} from "@/lib/feature-announcements";
import { normalizeHashtagFilters } from "@/lib/filters/hashtag-filter";
import { goalToday } from "@/lib/goals";
import { getRequestTimezone } from "@/lib/request-timezone";
import { getViewerGradePreferences } from "@/lib/session";
import { toArray, type UrlParamsRecord } from "@/lib/url-params";
import { parseDisciplineScope, resolveDisciplineScope } from "@/lib/user-analytics";

type UserAnalyticsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<UrlParamsRecord>;
};

export async function generateMetadata({ params }: UserAnalyticsPageProps): Promise<Metadata> {
  const { id } = await params;
  return memberMetadata(
    await resolveProfilePage(id, "viewer"),
    (user) => `${user.name} · Analytics`,
  );
}

export default async function UserAnalyticsPage({ params, searchParams }: UserAnalyticsPageProps) {
  const [{ id }, search] = await Promise.all([params, searchParams]);

  const resolved = await resolveProfilePage(id, "viewer");
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { user, viewerId, session } = resolved;

  return (
    <ProfileHeader
      user={user}
      viewerId={viewerId}
      workspace="progress"
      fallback={<AnalyticsLoading />}
    >
      <AnalyticsView
        userId={user.id}
        viewerId={viewerId}
        viewerCreatedAt={session.user.createdAt}
        search={search}
      />
    </ProfileHeader>
  );
}

// oxlint-disable-next-line complexity -- assembles many independent page sections from search params
async function AnalyticsView({
  userId: id,
  viewerId,
  viewerCreatedAt,
  search,
}: {
  userId: string;
  viewerId: string;
  viewerCreatedAt: Date;
  search: UrlParamsRecord;
}) {
  const db = await getDb();

  const selectedTags = normalizeHashtagFilters(toArray(search.tag));
  const journalVisible = await canReadUserJournal(id, viewerId);
  const isOwner = viewerId === id;
  const [rows, journalSessions, tags, viewerAnnouncements] = await Promise.all([
    getUserSendsForAnalytics(db, id, viewerId, selectedTags),
    journalVisible
      ? getJournalSessionsForAnalytics(db, id, viewerId, selectedTags)
      : Promise.resolve(undefined),
    getUserHashtags(db, id, viewerId),
    isOwner
      ? getViewerFeatureAnnouncements(viewerId, viewerCreatedAt.getTime())
      : Promise.resolve([]),
  ]);

  const { present, scope } = resolveDisciplineScope({
    rows,
    sessions: journalSessions,
    requested: parseDisciplineScope(
      typeof search.discipline === "string" ? search.discipline : undefined,
    ),
  });

  if (scope == null) {
    return <EmptyProfileAnalytics tags={tags} selectedTags={selectedTags} isOwner={isOwner} />;
  }

  const [initialLayout, highlightSessions, overview] = await Promise.all([
    getAnalyticsLayout(db, id, viewerId),
    journalVisible ? getAnalyticsHighlightSessions(db, id, viewerId, selectedTags) : [],
    getRequestTimezone().then((zone) => getClimberOverview(db, id, viewerId, goalToday(zone))),
  ]);
  const announcements = getAnnouncementCandidates(viewerAnnouncements, {
    page: ANALYTICS_CUSTOMIZE_ANNOUNCEMENT.page,
    availableFeatureIds: [ANALYTICS_CUSTOMIZE_ANNOUNCEMENT.featureId],
    userCreatedAt: viewerCreatedAt,
    now: new Date(),
  });
  return (
    <ProfileAnalyticsDashboard
      userId={id}
      viewerId={viewerId}
      scope={scope}
      present={present}
      yearFilter={search.years ?? search.period}
      rows={rows}
      highlightSessions={highlightSessions}
      journalSessions={journalSessions}
      tags={tags}
      selectedTags={selectedTags}
      journalVisible={journalVisible}
      isOwner={isOwner}
      gradePreferences={await getViewerGradePreferences()}
      initialLayout={initialLayout}
      overview={overview}
      announcements={announcements}
    />
  );
}
