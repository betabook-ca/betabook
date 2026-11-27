import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { AnalyticsYearNavigation } from "@/components/analytics-year-filter";
import { DisciplineScopeNav } from "@/components/discipline-scope-nav";
import { FeatureAnnouncementScope } from "@/components/feature-announcement";
import { AnalyticsHashtagFilter } from "@/components/filters/analytics-hashtag-filter";
import { LogEntryButton } from "@/components/journal";
import {
  NavigationPendingProvider,
  NavigationPendingRegion,
} from "@/components/navigation-pending";
import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import { buildAnalyticsHighlights, type HighlightSession } from "@/lib/analytics-highlights";
import type { AnalyticsLayout } from "@/lib/analytics-layout";
import type { AnalyticsSendRow, AnalyticsSessionRow, ClimberOverview } from "@/lib/analytics-types";
import { parseAnalyticsYears } from "@/lib/analytics-years";
import { describeClimber, describeRecency } from "@/lib/climber-summary";
import type { FeatureAnnouncementDefinition } from "@/lib/feature-announcements";
import type { ClimbType, GradePreferences } from "@/lib/grades";
import { buildUserAnalytics, getAnalyticsHistorySummary } from "@/lib/user-analytics";
import { saveAnalyticsLayout } from "@/spa/lib/actions-client";

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

type FilterProps = { tags: string[]; selectedTags: string[]; isOwner: boolean; pending?: boolean };

function analyticsEmptyState({
  selectedTags,
  isOwner,
}: Pick<FilterProps, "selectedTags" | "isOwner">) {
  return (
    <EmptyState
      message={
        selectedTags.length > 0 ? "Nothing matches these tags." : "No sends or sessions yet."
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
  );
}

export function ProfileAnalyticsDashboard({
  pending,
  userId: id,
  viewerId,
  scope: selectedScope,
  present,
  yearFilter,
  rows,
  highlightSessions,
  journalSessions,
  tags,
  selectedTags,
  journalVisible,
  isOwner,
  gradePreferences,
  initialLayout,
  overview,
  announcements,
}: FilterProps & {
  userId: string;
  viewerId: string;
  scope: ClimbType | null;
  present: ClimbType[];
  yearFilter: string | string[] | undefined;
  rows: AnalyticsSendRow[];
  highlightSessions: HighlightSession[];
  journalSessions: AnalyticsSessionRow[] | undefined;
  journalVisible: boolean;
  gradePreferences: GradePreferences;
  initialLayout: AnalyticsLayout;
  overview: ClimberOverview;
  announcements: FeatureAnnouncementDefinition[];
}) {
  // No discipline has data when the selected tags match nothing. Keep the same
  // toolbar and workspace mounted while their results switch to the empty message.
  const scope = selectedScope ?? "boulder";
  const { years, undatedCount } = getAnalyticsHistorySummary(rows, scope, journalSessions);
  const selectedYears = parseAnalyticsYears(yearFilter, years);
  const analytics = buildUserAnalytics(
    rows,
    scope,
    journalSessions,
    selectedYears,
    gradePreferences,
  );
  const summary = selectedScope
    ? [describeClimber(overview), describeRecency(overview)].filter(Boolean).join(" ")
    : undefined;

  return (
    <FeatureAnnouncementScope
      userId={viewerId}
      page={`/users/${id}/analytics`}
      announcements={announcements}
    >
      {/* The provider links the tag filter's in-flight navigation to the
       * dashboard it is about to replace, which dims while pending. */}
      <NavigationPendingProvider>
        <NavigationPendingRegion pending={pending}>
          <AnalyticsDashboard
            emptyState={
              selectedScope === null ? analyticsEmptyState({ selectedTags, isOwner }) : undefined
            }
            summary={summary}
            key={id}
            canCustomize={isOwner}
            initialLayout={initialLayout}
            onSave={isOwner ? saveAnalyticsLayout : undefined}
            analytics={analytics}
            sends={rows}
            sessions={highlightSessions}
            highlights={buildAnalyticsHighlights(highlightSessions, scope, selectedYears, rows)}
            undatedCount={undatedCount}
            scope={scope}
            journalVisible={journalVisible}
            selectedYears={selectedYears}
            periodPicker={
              <>
                {selectedScope && (
                  <DisciplineScopeNav
                    present={present}
                    scope={scope}
                    href={(type) => analyticsHref(id, type, selectedYears, selectedTags)}
                  />
                )}
                <AnalyticsHashtagFilter
                  selectedTags={selectedTags}
                  tags={tags}
                  controls={
                    selectedScope && (
                      <div className="min-w-0 flex-1">
                        <AnalyticsYearNavigation
                          years={years.toReversed()}
                          selected={selectedYears}
                        />
                      </div>
                    )
                  }
                />
              </>
            }
          />
        </NavigationPendingRegion>
      </NavigationPendingProvider>
    </FeatureAnnouncementScope>
  );
}
