import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { saveAnalyticsLayout } from "@/actions";
import { ProfileHeader, getUserById } from "@/app/users/[id]/profile-shell";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { AnalyticsYearNavigation } from "@/components/analytics-year-filter";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { FeatureAnnouncementScope } from "@/components/feature-announcement";
import { AnalyticsHashtagFilter } from "@/components/filters/analytics-hashtag-filter";
import { AppLink } from "@/components/ui/app-link";
import { choicePillClass } from "@/components/ui/choice-pill";
import { DISCIPLINE_CHIP_CLASSNAME, DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import { getJournalSessionsForAnalytics, getUserSendsForAnalytics } from "@/db/queries";
import { getAnalyticsHighlightSessions } from "@/db/queries/analytics-highlights";
import { getAnalyticsLayout } from "@/db/queries/analytics-layout";
import { canReadJournal } from "@/db/queries/content-access";
import { getViewerFeatureAnnouncements } from "@/db/queries/feature-announcements";
import { getUserHashtags } from "@/db/queries/hashtag-filter";
import { buildAnalyticsHighlights } from "@/lib/analytics-highlights";
import { parseAnalyticsYears } from "@/lib/analytics-years";
import {
  ANALYTICS_CUSTOMIZE_ANNOUNCEMENT,
  getAnnouncementCandidates,
} from "@/lib/feature-announcements";
import { normalizeHashtagFilters } from "@/lib/filters/hashtag-filter";
import type { ClimbType } from "@/lib/grades";
import { getMemberSession as getSession } from "@/lib/session";
import { toArray, type UrlParamsRecord } from "@/lib/url-params";
import { buildUserAnalytics, DISCIPLINE_ORDER, parseDisciplineScope } from "@/lib/user-analytics";
import { canViewUser } from "@/lib/user-visibility";

type UserAnalyticsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<UrlParamsRecord>;
};

export async function generateMetadata({ params }: UserAnalyticsPageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession();
  if (!session) return { title: "Member content", robots: { index: false } };
  const user = await getUserById(id);
  if (!user || !canViewUser(user, session.user.id)) notFound();

  return { title: `${user.name} · Analytics`, robots: { index: false } };
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

  const session = await getSession();
  if (!session) return <CurrentPageAuthCallout />;
  const [db, user] = await Promise.all([getDb(), getUserById(id)]);
  if (!user) notFound();
  const viewerId = session.user.id;
  if (!canViewUser(user, viewerId)) notFound();

  const selectedTags = normalizeHashtagFilters(toArray(search.tag));
  const journalVisible = await canReadJournal(db, user.id, viewerId);
  const isOwner = viewerId === id;
  const [rows, journalSessions, tags, viewerAnnouncements] = await Promise.all([
    getUserSendsForAnalytics(db, id, viewerId, selectedTags),
    journalVisible
      ? getJournalSessionsForAnalytics(db, user.id, viewerId, selectedTags)
      : Promise.resolve(undefined),
    getUserHashtags(db, id, viewerId),
    isOwner
      ? getViewerFeatureAnnouncements(session.user.id, session.user.createdAt.getTime())
      : Promise.resolve([]),
  ]);

  // Grades only compare within one discipline, so the whole page is always
  // scoped to one — the chips only offer disciplines this climber has
  // actually logged, and the default is their most-logged.
  const present = DISCIPLINE_ORDER.filter(
    (type) =>
      rows.some((row) => row.climbType === type) ||
      journalSessions?.some((entry) => entry.climbType === type),
  );
  const disciplineVolume = (type: ClimbType) =>
    journalSessions
      ? journalSessions
          .filter((entry) => entry.climbType === type)
          .reduce((total, entry) => total + entry.count, 0)
      : rows.filter((entry) => entry.climbType === type).length;
  const dominant = [...present].sort((a, b) => disciplineVolume(b) - disciplineVolume(a))[0];
  const requested = parseDisciplineScope(
    typeof search.discipline === "string" ? search.discipline : undefined,
  );
  const scope = requested !== "all" && present.includes(requested) ? requested : (dominant ?? null);

  if (scope == null) {
    const content = (
      <div className="flex flex-col gap-6">
        <ProfileHeader user={user} viewerId={session.user.id} />
        <SectionHeading>Analytics</SectionHeading>
        <AnalyticsHashtagFilter selectedTags={selectedTags} tags={tags} />
        <EmptyState
          message={
            selectedTags.length > 0
              ? "No sends or outdoor sessions match these tags. Remove selected tags to see more activity."
              : "No outdoor sessions logged yet — analytics appear with the first session."
          }
        />
      </div>
    );
    return (
      <FeatureAnnouncementScope
        userId={session.user.id}
        page={`/users/${id}/analytics`}
        announcements={[]}
      >
        {content}
      </FeatureAnnouncementScope>
    );
  }

  const initialLayout = await getAnalyticsLayout(db, id, viewerId);
  const announcements = getAnnouncementCandidates(viewerAnnouncements, {
    page: ANALYTICS_CUSTOMIZE_ANNOUNCEMENT.page,
    availableFeatureIds: [ANALYTICS_CUSTOMIZE_ANNOUNCEMENT.featureId],
    userCreatedAt: session.user.createdAt,
    now: new Date(),
  });
  const highlightSessions = journalVisible
    ? await getAnalyticsHighlightSessions(db, id, viewerId, selectedTags)
    : [];
  const lifetime = buildUserAnalytics(rows, scope, journalSessions);
  // Offer the same years across disciplines so switching never silently resets the period.
  const all = buildUserAnalytics(rows, "all", journalSessions);
  const years = [...new Set([...all.years, ...all.calendarYears])].sort((a, b) => b - a);
  const selectedYears = parseAnalyticsYears(search.years ?? search.period, years);
  const analytics = selectedYears.length
    ? buildUserAnalytics(rows, scope, journalSessions, selectedYears)
    : lifetime;

  const content = (
    <div className="flex flex-col gap-6">
      <ProfileHeader user={user} viewerId={session.user.id} />

      <AnalyticsDashboard
        key={id}
        canCustomize={isOwner}
        initialLayout={initialLayout}
        onSave={isOwner ? saveAnalyticsLayout : undefined}
        analytics={analytics}
        sends={rows}
        sessions={highlightSessions}
        highlights={buildAnalyticsHighlights(highlightSessions, scope, selectedYears)}
        undatedCount={lifetime.datelessCount}
        scope={scope}
        journalVisible={journalVisible}
        selectedYears={selectedYears}
        periodPicker={
          <>
            {present.length > 1 && (
              <nav aria-label="Discipline" className="flex flex-wrap gap-2">
                {present.map((type) => {
                  const selected = type === scope;
                  return (
                    <AppLink
                      key={type}
                      href={analyticsHref(id, type, selectedYears, selectedTags)}
                      aria-current={selected ? "true" : undefined}
                      className={choicePillClass(selected, DISCIPLINE_CHIP_CLASSNAME[type])}
                    >
                      {DISCIPLINE_LABELS[type]}
                    </AppLink>
                  );
                })}
              </nav>
            )}
            <AnalyticsHashtagFilter
              selectedTags={selectedTags}
              tags={tags}
              controls={
                <div className="min-w-0 flex-1">
                  <AnalyticsYearNavigation years={years.toReversed()} selected={selectedYears} />
                </div>
              }
            />
          </>
        }
      />
    </div>
  );
  return (
    <FeatureAnnouncementScope
      userId={session.user.id}
      page={`/users/${id}/analytics`}
      announcements={announcements}
    >
      {content}
    </FeatureAnnouncementScope>
  );
}
