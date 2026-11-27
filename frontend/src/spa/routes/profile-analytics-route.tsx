import { useParams, useSearchParams } from "react-router";

import { AnalyticsLoading } from "@/components/analytics-loading";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { ProfileAnalyticsDashboard } from "@/components/profile-analytics-view";
import { useGradePreferences } from "@/components/ui/grade-preferences";
import type { HighlightSession } from "@/lib/analytics-highlights";
import { parseAnalyticsLayout } from "@/lib/analytics-layout";
import type { AnalyticsSessionRow } from "@/lib/analytics-types";
import {
  ANALYTICS_CUSTOMIZE_ANNOUNCEMENT,
  getAnnouncementCandidates,
} from "@/lib/feature-announcements";
import { normalizeHashtagFilters } from "@/lib/filters/hashtag-filter";
import { parseDisciplineScope, resolveDisciplineScope } from "@/lib/user-analytics";
import { fetchApi } from "@/spa/lib/api";
import { usePageTitle } from "@/spa/lib/document-navigation";
import { isNotFoundError } from "@/spa/lib/fetch-json";
import { SpaProfileHeader } from "@/spa/lib/profile-shell";
import { useRetainedPage } from "@/spa/lib/use-retained-page";

function sessionCounts(sessions: HighlightSession[] | null): AnalyticsSessionRow[] | undefined {
  if (!sessions) return undefined;
  const counts = new Map<string, AnalyticsSessionRow>();
  for (const { entryDate, climbType } of sessions) {
    const key = entryDate + ":" + climbType;
    const row = counts.get(key);
    if (row) row.count += 1;
    else counts.set(key, { entryDate, climbType, count: 1 });
  }
  return Array.from(counts.values());
}

export default function ProfileAnalyticsRoute({ viewerId }: { viewerId: string | null }) {
  const { id } = useParams();
  const [search] = useSearchParams();
  const gradePreferences = useGradePreferences();
  const tags = normalizeHashtagFilters(search.getAll("tag"));
  const tagQuery = new URLSearchParams(
    tags.map((tag): [string, string] => ["tag", tag]),
  ).toString();
  const { data, error, pending } = useRetainedPage({
    scope: id && viewerId ? JSON.stringify([id, viewerId]) : null,
    query: tagQuery,
    load: (signal) =>
      fetchApi("/api/pages/users/{id}/analytics", {
        path: { id: id ?? "" },
        query: new URLSearchParams(tagQuery),
        signal,
      }),
  });
  usePageTitle(data ? data.header.user.name + " · Analytics" : null);
  if (!viewerId) return <CurrentPageAuthCallout />;
  const message = error
    ? isNotFoundError(error)
      ? "Climber not found"
      : "Could not load analytics."
    : null;
  if (!data) return message ? <p role="alert">{message}</p> : <AnalyticsLoading />;
  const { header, rows, highlightSessions, overview } = data;
  const journalSessions = sessionCounts(highlightSessions);
  const disciplines = search.getAll("discipline");
  const { scope, present } = resolveDisciplineScope({
    rows,
    sessions: journalSessions,
    requested: parseDisciplineScope(disciplines.length === 1 ? disciplines[0] : undefined),
  });
  const common = {
    tags: data.tags,
    selectedTags: tags,
    isOwner: header.isOwner,
    pending,
  };
  const announcements = data.showAnnouncement
    ? getAnnouncementCandidates([ANALYTICS_CUSTOMIZE_ANNOUNCEMENT], {
        userCreatedAt: new Date(data.viewerCreatedAt),
        now: new Date(data.nowMs),
      })
    : [];
  return (
    <SpaProfileHeader {...header} workspace="progress">
      {message && <p role="alert">{message}</p>}
      <ProfileAnalyticsDashboard
        {...common}
        userId={header.user.id}
        viewerId={viewerId}
        scope={scope}
        present={present}
        yearFilter={search.getAll(search.has("years") ? "years" : "period")}
        rows={rows}
        highlightSessions={highlightSessions ?? []}
        journalSessions={journalSessions}
        journalVisible={header.access.journal}
        gradePreferences={gradePreferences}
        initialLayout={parseAnalyticsLayout(data.layout)}
        overview={overview}
        announcements={announcements}
      />
    </SpaProfileHeader>
  );
}
