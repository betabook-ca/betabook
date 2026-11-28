import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router";

import { HomeIntroduction } from "@/components/landing/home-introduction";
import { AppSearch } from "@/components/search/app-search";
import { CARD_PADDING } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/typography";
import type { AreaSelection } from "@/lib/area-selection";
import {
  areaSearchItems,
  parseSearchState,
  publicClimbSearchItems,
  SEARCH_PATH,
  type SearchSnapshot,
} from "@/lib/search";
import { searchParamsToRecord } from "@/lib/url-params";
import { peekBootstrapData } from "@/spa/bootstrap";
import { fetchApi } from "@/spa/lib/api";
import type { SearchBootstrapData } from "@/spa/lib/fetch-json";

function searchSnapshot(seed: SearchBootstrapData | null): SearchSnapshot {
  const sections: SearchSnapshot = [];
  if (seed?.climbsPage)
    sections.push({
      kind: "climb",
      status: "ready",
      page: {
        items: publicClimbSearchItems(seed.climbsPage),
        hasMore: seed.climbsPage.hasNextPage,
        nextPage: 2,
      },
    });
  if (seed?.areasPage)
    sections.push({
      kind: "area",
      status: "ready",
      page: {
        items: areaSearchItems(seed.areasPage.areas),
        hasMore: seed.areasPage.hasNextPage,
        nextPage: 2,
      },
    });
  return sections;
}

export default function SearchRoute({
  viewerId,
  home = false,
}: {
  viewerId: string | null;
  home?: boolean;
}) {
  const [params] = useSearchParams();
  const rawQuery = params.toString();
  const seed = (
    !home && !viewerId ? peekBootstrapData("search", "/search", rawQuery) : null
  ) as SearchBootstrapData | null;
  const [knownAreas, setKnownAreas] = useState<Record<string, AreaSelection>>({});
  const defaultCategory = home ? "all" : "climb";
  const parsed = parseSearchState(searchParamsToRecord(params), null, defaultCategory);
  const id = parsed.filter.areaId;
  const seededArea = seed?.areaSelection;
  const cached =
    id !== undefined
      ? (knownAreas[id] ?? (seededArea?.id === String(id) ? seededArea : undefined))
      : undefined;
  const initialState = {
    ...parsed,
    area:
      cached ?? (id === undefined ? null : { id: String(id), name: "Unavailable area", path: "" }),
  };
  // The Worker sends one snapshot per document. Once navigation invalidates its
  // envelope, the search controller fetches subsequent pages from the API.
  const [initial] = useState(() => searchSnapshot(seed));
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
  if (home && rawQuery) return <Navigate replace to={SEARCH_PATH + "?" + rawQuery} />;
  if (home && viewerId) return <Navigate replace to={"/users/" + viewerId} />;
  return (
    <div className={home ? `flex flex-col gap-6 ${CARD_PADDING.fluid}` : "flex flex-col gap-6"}>
      {home ? (
        <HomeIntroduction />
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
        initial={seed ? initial : undefined}
        suggestions={null}
        viewerId={viewerId}
        onAreaSelected={remember}
        showMemberNotice={!home}
        memberNoticePlacement="top"
      />
    </div>
  );
}
