import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { AppSearch } from "@/components/search/app-search";
import { PageTitle } from "@/components/ui/typography";
import type { AreaSelection } from "@/lib/area-selection";
import { parseSearchState, publicClimbSearchItems, type SearchSnapshot } from "@/lib/search";
import { searchParamsToRecord } from "@/lib/url-params";
import { peekBootstrapData } from "@/spa/bootstrap";
import { fetchApi } from "@/spa/lib/api";
import type { SearchBootstrapData } from "@/spa/lib/fetch-json";

export default function SearchRoute({ viewerId }: { viewerId: string | null }) {
  const [searchParams] = useSearchParams();
  const rawQuery = searchParams.toString();
  const [resolvedArea, setResolvedArea] = useState<{
    areaId: number;
    selection: AreaSelection;
  } | null>(null);

  const parsedWithoutArea = parseSearchState(searchParamsToRecord(searchParams), null, "climb");
  const requestedAreaId = parsedWithoutArea.filter.areaId;
  const matchedArea =
    requestedAreaId !== undefined && resolvedArea?.areaId === requestedAreaId
      ? resolvedArea.selection
      : requestedAreaId !== undefined
        ? { id: String(requestedAreaId), name: "Unavailable area", path: "" }
        : null;

  const initialState = parseSearchState(searchParamsToRecord(searchParams), matchedArea, "climb");

  const bootstrapped =
    !viewerId && (peekBootstrapData("search", "/search", rawQuery) as SearchBootstrapData | null);

  const initialSnapshot: SearchSnapshot = bootstrapped
    ? [
        {
          kind: "climb",
          page: {
            items: publicClimbSearchItems(bootstrapped.climbsPage),
            hasMore: bootstrapped.climbsPage.hasNextPage,
            nextPage: 2,
          },
          status: "ready",
        },
      ]
    : [];

  useEffect(() => {
    if (requestedAreaId === undefined) {
      return;
    }
    let cancelled = false;
    async function loadArea() {
      try {
        const res = await fetchApi("/api/public/areas/{id}", {
          path: { id: String(requestedAreaId) },
        });
        if (!cancelled) {
          setResolvedArea({
            areaId: res.area.id,
            selection: {
              id: String(res.area.id),
              name: res.area.name,
              path: res.ancestors.map((a) => a.name).join(" / "),
            },
          });
        }
      } catch {
        // Keep the explicit ID when its catalog entry is unavailable.
      }
    }
    void loadArea();
    return () => {
      cancelled = true;
    };
  }, [requestedAreaId]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <PageTitle>Find climbs</PageTitle>
        <p className="text-sm text-muted">
          Browse an area by grade, rating and ascents, or search by name.
        </p>
      </div>
      <AppSearch
        initialState={initialState}
        initial={initialSnapshot}
        suggestions={null}
        viewerId={viewerId}
        defaultCategory="climb"
        showMemberNotice
        memberNoticePlacement="top"
      />
    </div>
  );
}
