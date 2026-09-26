import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { saveAnalyticsLayout } from "@/actions";
import {
  ProfileHeader,
  canReadUserJournal,
  memberMetadata,
  resolveProfilePage,
} from "@/app/users/[id]/profile-shell";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { AnalyticsYearNavigation } from "@/components/analytics-year-filter";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { DisciplineScopeNav } from "@/components/discipline-scope-nav";
import { FeatureAnnouncementScope } from "@/components/feature-announcement";
import { AnalyticsHashtagFilter } from "@/components/filters/analytics-hashtag-filter";
import { LogEntryButton } from "@/components/journal";
import {
  NavigationPendingProvider,
  NavigationPendingRegion,
} from "@/components/navigation-pending";
import { SocialCardLauncher } from "@/components/social-card-launcher";
import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import { getJournalSessionsForAnalytics, getUserSendsForAnalytics } from "@/db/queries";
import { getAnalyticsHighlightSessions } from "@/db/queries/analytics-highlights";
import { getAnalyticsLayout } from "@/db/queries/analytics-layout";
import { getClimberOverview } from "@/db/queries/climber-overview";
import { getViewerFeatureAnnouncements } from "@/db/queries/feature-announcements";
import { getUserHashtags } from "@/db/queries/hashtag-filter";
import { buildAnalyticsHighlights } from "@/lib/analytics-highlights";
import { parseAnalyticsYears } from "@/lib/analytics-years";
import { describeClimber, describeRecency } from "@/lib/climber-summary";
import {
  ANALYTICS_CUSTOMIZE_ANNOUNCEMENT,
  getAnnouncementCandidates,
} from "@/lib/feature-announcements";
import { normalizeHashtagFilters } from "@/lib/filters/hashtag-filter";
import { goalToday } from "@/lib/goals";
import type { ClimbType } from "@/lib/grades";
import { getOwnProfileShareToken } from "@/lib/profile-share-url";
import { isYearInReviewMonth } from "@/lib/social-card";
import { toArray, type UrlParamsRecord } from "@/lib/url-params";
import {
  buildUserAnalytics,
  getAnalyticsHistorySummary,
  parseDisciplineScope,
  resolveDisciplineScope,
} from "@/lib/user-analytics";

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

function analyticsHref(
  userId: string,
  scope: ClimbType,
  selectedYears: number[],
  tags: string[],
): string {
  const query = new URLSearchParams({ discipline: scope });
  if (selectedYears.length) query.set("years", selectedYears.join(","));
  for (const tag of tags) query.append("tag", tag);
  return `/users/${userId}/analytics?${query}`;
}

// oxlint-disable-next-line complexity -- assembles many independent page sections from search params
export default async function UserAnalyticsPage({ params, searchParams }: UserAnalyticsPageProps) {
  const [{ id }, search] = await Promise.all([params, searchParams]);

  const resolved = await resolveProfilePage(id, "viewer");
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { user, viewerId, session } = resolved;
  const db = await getDb();
  const { cf } = await getCloudflareContext({ async: true });
  const today = goalToday(cf?.timezone ?? "UTC");

  const selectedTags = normalizeHashtagFilters(toArray(search.tag));
  const journalVisible = await canReadUserJournal(user.id, viewerId);
  const isOwner = viewerId === id;
  const showYearInReview = isOwner && isYearInReviewMonth(today);
  const [rows, journalSessions, tags, viewerAnnouncements, shareToken] = await Promise.all([
    getUserSendsForAnalytics(db, id, viewerId, selectedTags),
    journalVisible
      ? getJournalSessionsForAnalytics(db, user.id, viewerId, selectedTags)
      : Promise.resolve(undefined),
    getUserHashtags(db, id, viewerId),
    isOwner
      ? getViewerFeatureAnnouncements(viewerId, session.user.createdAt.getTime())
      : Promise.resolve([]),
    showYearInReview ? getOwnProfileShareToken(db, user) : Promise.resolve(null),
  ]);

  const { present, scope } = resolveDisciplineScope({
    rows,
    sessions: journalSessions,
    requested: parseDisciplineScope(
      typeof search.discipline === "string" ? search.discipline : undefined,
    ),
  });

  if (scope == null) {
    return (
      <ProfileHeader user={user} viewerId={viewerId} workspace="progress">
        <NavigationPendingProvider>
          <div className="flex min-w-0 flex-col gap-6">
            <SectionHeading className="sr-only">Analytics</SectionHeading>
            <AnalyticsHashtagFilter selectedTags={selectedTags} tags={tags} />
            <NavigationPendingRegion>
              <EmptyState
                message={
                  selectedTags.length > 0
                    ? "Nothing matches these tags."
                    : "No sends or sessions yet."
                }
                cta={
                  isOwner && selectedTags.length === 0 ? (
                    <div className="flex flex-col items-center gap-3">
                      <LogEntryButton />
                      <AppLink href="/account/import" className="text-sm">
                        Import your sends
                      </AppLink>
                    </div>
                  ) : undefined
                }
              />
            </NavigationPendingRegion>
          </div>
        </NavigationPendingProvider>
      </ProfileHeader>
    );
  }

  const [initialLayout, highlightSessions] = await Promise.all([
    getAnalyticsLayout(db, id, viewerId),
    journalVisible ? getAnalyticsHighlightSessions(db, id, viewerId, selectedTags) : [],
  ]);
  const announcements = getAnnouncementCandidates(viewerAnnouncements, {
    page: ANALYTICS_CUSTOMIZE_ANNOUNCEMENT.page,
    availableFeatureIds: [ANALYTICS_CUSTOMIZE_ANNOUNCEMENT.featureId],
    userCreatedAt: session.user.createdAt,
    now: new Date(),
  });
  const { years, undatedCount } = getAnalyticsHistorySummary(rows, scope, journalSessions);
  const selectedYears = parseAnalyticsYears(search.years ?? search.period, years);
  const analytics = buildUserAnalytics(rows, scope, journalSessions, selectedYears);
  const overview = await getClimberOverview(db, user.id, viewerId, today);
  const summary = [describeClimber(overview), describeRecency(overview)].filter(Boolean).join(" ");

  return (
    <FeatureAnnouncementScope
      userId={viewerId}
      page={`/users/${id}/analytics`}
      announcements={announcements}
    >
      <ProfileHeader user={user} viewerId={viewerId} workspace="progress">
        {/* The provider links the tag filter's in-flight navigation to the
         * dashboard it is about to replace, which dims while pending. */}
        <NavigationPendingProvider>
          <NavigationPendingRegion>
            <AnalyticsDashboard
              summary={summary}
              key={id}
              canCustomize={isOwner}
              initialLayout={initialLayout}
              onSave={isOwner ? saveAnalyticsLayout : undefined}
              shareCard={
                showYearInReview ? (
                  <SocialCardLauncher
                    userId={id}
                    name={user.name}
                    year={Number(today.slice(0, 4))}
                    linkedRecapAvailable={shareToken !== null}
                  />
                ) : undefined
              }
              analytics={analytics}
              sends={rows}
              sessions={highlightSessions}
              highlights={buildAnalyticsHighlights(highlightSessions, scope, selectedYears)}
              undatedCount={undatedCount}
              scope={scope}
              journalVisible={journalVisible}
              selectedYears={selectedYears}
              periodPicker={
                <>
                  <DisciplineScopeNav
                    present={present}
                    scope={scope}
                    href={(type) => analyticsHref(id, type, selectedYears, selectedTags)}
                  />
                  <AnalyticsHashtagFilter
                    selectedTags={selectedTags}
                    tags={tags}
                    controls={
                      <div className="min-w-0 flex-1">
                        <AnalyticsYearNavigation
                          years={years.toReversed()}
                          selected={selectedYears}
                        />
                      </div>
                    }
                  />
                </>
              }
            />
          </NavigationPendingRegion>
        </NavigationPendingProvider>
      </ProfileHeader>
    </FeatureAnnouncementScope>
  );
}
