import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { AppSearch } from "@/components/search/app-search";
import { PageTitle } from "@/components/ui/typography";
import type { AreaSelection } from "@/lib/area-selection";
import { parseSearchState, publicClimbSearchItems, type SearchSnapshot } from "@/lib/search";
import { searchParamsToRecord } from "@/lib/url-params";
import { peekBootstrapData } from "@/spa/bootstrap";
import { fetchJson, type SearchBootstrapData } from "@/spa/lib/fetch-json";

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
        const res = await fetchJson<{
          area: { id: number; name: string };
          ancestors: { id: number; name: string }[];
        }>(`/api/public/areas/${requestedAreaId}`);
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
        // Fallback name stays "Selected area" cleanly.
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
