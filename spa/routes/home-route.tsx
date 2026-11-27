import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router";

import { LandingHero } from "@/components/landing-page";
import { AppSearch } from "@/components/search/app-search";
import { CARD_PADDING } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/typography";
import type { AreaSelection } from "@/lib/area-selection";
import { LOGBOOK_PAGE } from "@/lib/landing-pages";
import { parseSearchState, SEARCH_KINDS, SEARCH_PATH, type SearchSnapshot } from "@/lib/search";
import { signUpUrl } from "@/lib/sign-in-redirect";
import { searchParamsToRecord } from "@/lib/url-params";
import { fetchJson } from "@/spa/lib/fetch-json";

const EMPTY_HOME_SNAPSHOT: SearchSnapshot = SEARCH_KINDS.map((kind) => ({
  kind,
  page: { items: [], hasMore: false, nextPage: 1 },
  status: "idle" as const,
}));

export default function HomeRoute({ viewerId }: { viewerId: string | null }) {
  const [searchParams] = useSearchParams();
  const [resolvedArea, setResolvedArea] = useState<AreaSelection | null>(null);
  const rawQuery = searchParams.toString();

  const initialState = parseSearchState(searchParamsToRecord(searchParams), resolvedArea, "all");
  const areaId = initialState.filter.areaId;

  useEffect(() => {
    if (areaId === undefined || viewerId !== null || rawQuery.length > 0) {
      return;
    }
    let cancelled = false;
    async function loadArea() {
      try {
        const res = await fetchJson<{
          area: { id: number; name: string };
          ancestors: { id: number; name: string }[];
        }>(`/api/public/areas/${areaId}`);
        if (!cancelled) {
          setResolvedArea({
            id: String(res.area.id),
            name: res.area.name,
            path: res.ancestors.map((a) => a.name).join(" / "),
          });
        }
      } catch {
        // Ignore unavailable area selection.
      }
    }
    void loadArea();
    return () => {
      cancelled = true;
    };
  }, [areaId, viewerId, rawQuery.length]);

  if (rawQuery) {
    return <Navigate to={`${SEARCH_PATH}?${rawQuery}`} replace />;
  }

  if (viewerId) {
    return <Navigate to={`/users/${viewerId}`} replace />;
  }

  return (
    <div className={`flex flex-col gap-6 ${CARD_PADDING.fluid}`}>
      <LandingHero
        title="A free climbing logbook and crag database"
        lead="Log bouldering, sport and trad sends and sessions, and search routes and problems below."
        actions={[
          { href: signUpUrl(), label: "Create a free account" },
          { href: LOGBOOK_PAGE.path, label: "How Betabook works" },
        ]}
      />
      <SectionHeading className="mt-2">Search climbs and areas</SectionHeading>
      <AppSearch
        initialState={initialState}
        initial={EMPTY_HOME_SNAPSHOT}
        suggestions={null}
        viewerId={null}
        defaultCategory="all"
        showMemberNotice={false}
      />
    </div>
  );
}
