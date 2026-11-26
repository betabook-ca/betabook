import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router";

import { LandingHero } from "@/components/landing-page";
import { AppSearch } from "@/components/search/app-search";
import { CARD_PADDING } from "@/components/ui/card";
import { PageTitle, SectionHeading } from "@/components/ui/typography";
import type { AreaSelection } from "@/lib/area-selection";
import { LOGBOOK_PAGE } from "@/lib/landing-pages";
import {
  parseSearchState,
  publicClimbSearchItems,
  SEARCH_PATH,
  type SearchSnapshot,
} from "@/lib/search";
import { signUpUrl } from "@/lib/sign-in-redirect";
import { searchParamsToRecord } from "@/lib/url-params";
import { peekBootstrapData } from "@/spa/bootstrap";
import { fetchApi } from "@/spa/lib/api";
import type { SearchBootstrapData } from "@/spa/lib/fetch-json";

export default function SearchRoute({
  viewerId,
  home = false,
}: {
  viewerId: string | null;
  home?: boolean;
}) {
  const [params] = useSearchParams();
  const rawQuery = params.toString();
  const [knownAreas, setKnownAreas] = useState<Record<string, AreaSelection>>({});
  const defaultCategory = home ? "all" : "climb";
  const parsed = useMemo(
    () =>
      parseSearchState(searchParamsToRecord(new URLSearchParams(rawQuery)), null, defaultCategory),
    [rawQuery, defaultCategory],
  );
  const id = parsed.filter.areaId;
  const cached = id !== undefined ? knownAreas[id] : undefined;
  const initialState = useMemo(
    () => ({
      ...parsed,
      area:
        cached ??
        (id !== undefined ? { id: String(id), name: "Unavailable area", path: "" } : null),
    }),
    [parsed, id, cached],
  );
  function remember(area: AreaSelection) {
    setKnownAreas((previous) =>
      previous[area.id]?.name === area.name && previous[area.id]?.path === area.path
        ? previous
        : { ...previous, [area.id]: area },
    );
  }
  useEffect(() => {
    if (id === undefined || cached || home) return;
    const controller = new AbortController();
    async function load() {
      try {
        const data = await fetchApi("/api/public/areas/{id}", {
          path: { id: String(id) },
          signal: controller.signal,
        });
        if (!controller.signal.aborted)
          remember({
            id: String(data.area.id),
            name: data.area.name,
            path: data.ancestors.map((a) => a.name).join(" / "),
          });
      } catch {
        // A deleted or inaccessible area still scopes the search to its explicit ID.
      }
    }
    void load();
    return () => controller.abort();
  }, [id, cached, home]);
  const seed = (
    !home && !viewerId ? peekBootstrapData("search", "/search", rawQuery) : null
  ) as SearchBootstrapData | null;
  const initial = useMemo<SearchSnapshot>(
    () =>
      seed
        ? [
            {
              kind: "climb",
              page: {
                items: publicClimbSearchItems(seed.climbsPage),
                hasMore: seed.climbsPage.hasNextPage,
                nextPage: 2,
              },
              status: "ready",
            },
          ]
        : [],
    [seed],
  );
  if (home && rawQuery) return <Navigate replace to={SEARCH_PATH + "?" + rawQuery} />;
  if (home && viewerId) return <Navigate replace to={"/users/" + viewerId} />;
  return (
    <div className={home ? `flex flex-col gap-6 ${CARD_PADDING.fluid}` : "flex flex-col gap-6"}>
      {home ? (
        <div className="flex flex-col gap-6">
          <LandingHero
            title="A free climbing logbook and crag database"
            lead="Log bouldering, sport and trad sends and sessions, and search routes and problems below."
            actions={[
              { href: signUpUrl(), label: "Create a free account" },
              { href: LOGBOOK_PAGE.path, label: "How Betabook works" },
            ]}
          />
          <SectionHeading className="mt-2">Search climbs and areas</SectionHeading>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <PageTitle>Find climbs</PageTitle>
          <p className="text-sm text-muted">
            Browse an area by grade, rating and ascents, or search by name.
          </p>
        </div>
      )}
      <AppSearch
        initialState={initialState}
        initial={initial}
        suggestions={null}
        viewerId={viewerId}
        onAreaSelected={remember}
        showMemberNotice={!home}
        memberNoticePlacement="top"
      />
    </div>
  );
}
