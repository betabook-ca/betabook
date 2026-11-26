import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";

import { AnalyticsLoading } from "@/components/analytics-loading";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import {
  EmptyProfileAnalytics,
  ProfileAnalyticsDashboard,
} from "@/components/profile-analytics-view";
import { useGradePreferences } from "@/components/ui/grade-preferences";
import type { AnalyticsSessionRow } from "@/db/queries";
import type { HighlightSession } from "@/lib/analytics-highlights";
import { parseAnalyticsLayout } from "@/lib/analytics-layout";
import {
  ANALYTICS_CUSTOMIZE_ANNOUNCEMENT,
  getAnnouncementCandidates,
} from "@/lib/feature-announcements";
import { normalizeHashtagFilters } from "@/lib/filters/hashtag-filter";
import { parseDisciplineScope, resolveDisciplineScope } from "@/lib/user-analytics";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { usePageTitle } from "@/spa/lib/document-navigation";
import { isNotFoundError } from "@/spa/lib/fetch-json";
import { SpaProfileHeader } from "@/spa/lib/profile-shell";
import { useRouterRefreshKey } from "@/spa/lib/use-refresh-key";

type AnalyticsPayload = ApiResponse<"/api/pages/users/{id}/analytics">;

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
  const refresh = useRouterRefreshKey();
  const tags = normalizeHashtagFilters(search.getAll("tag"));
  const tagQuery = new URLSearchParams(
    tags.map((tag): [string, string] => ["tag", tag]),
  ).toString();
  const url = "/api/pages/users/" + encodeURIComponent(id ?? "") + "/analytics?" + tagQuery;
  // Only a tag change may keep a previous result visible while the next one loads.
  const identity = JSON.stringify([id, viewerId, refresh]);
  const [result, setResult] = useState<
    | { identity: string; url: string; data: AnalyticsPayload }
    | { identity: string; url: string; error: string }
  >();
  useEffect(() => {
    if (!viewerId) return;
    const controller = new AbortController();
    async function load() {
      try {
        const data = await fetchApi("/api/pages/users/{id}/analytics", {
          path: { id: id ?? "" },
          query: new URLSearchParams(tagQuery),
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setResult({ identity, url, data });
      } catch (cause) {
        if (!controller.signal.aborted)
          setResult({
            identity,
            url,
            error: isNotFoundError(cause) ? "Climber not found" : "Could not load analytics.",
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [identity, url, viewerId, id, tagQuery]);
  usePageTitle(
    result?.identity === identity && "data" in result
      ? result.data.header.user.name + " · Analytics"
      : null,
  );
  if (!viewerId) return <CurrentPageAuthCallout />;
  if (result?.identity !== identity || ("error" in result && result.url !== url))
    return <AnalyticsLoading />;
  if ("error" in result) return <p role="alert">{result.error}</p>;
  const { header, rows, highlightSessions, overview } = result.data;
  const journalSessions = sessionCounts(highlightSessions);
  const disciplines = search.getAll("discipline");
  const { scope, present } = resolveDisciplineScope({
    rows,
    sessions: journalSessions,
    requested: parseDisciplineScope(disciplines.length === 1 ? disciplines[0] : undefined),
  });
  const common = {
    tags: result.data.tags,
    selectedTags: tags,
    isOwner: header.isOwner,
    pending: result.url !== url,
  };
  const announcements = result.data.showAnnouncement
    ? getAnnouncementCandidates([ANALYTICS_CUSTOMIZE_ANNOUNCEMENT], {
        userCreatedAt: new Date(result.data.viewerCreatedAt),
        now: new Date(result.data.nowMs),
      })
    : [];
  return (
    <SpaProfileHeader {...header} workspace="progress">
      {scope === null ? (
        <EmptyProfileAnalytics {...common} />
      ) : (
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
          initialLayout={parseAnalyticsLayout(result.data.layout)}
          overview={overview}
          announcements={announcements}
        />
      )}
    </SpaProfileHeader>
  );
}
