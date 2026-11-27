import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { AddKindNav } from "@/components/add-kind-nav";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { NewClimbForm } from "@/components/new-climb-form";
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
import { PageTitle } from "@/components/ui/typography";
import { isClimbType } from "@/lib/grades";
import { parseAreaId, searchParamsToRecord, toArray } from "@/lib/url-params";
import { fetchApi } from "@/spa/lib/api";

type SelectedAreaInfo = {
  id: number;
  name: string;
  ancestorPath: string | null;
};

export default function NewClimbRoute({ viewerId }: { viewerId: string | null }) {
  const [searchParams] = useSearchParams();
  const paramsRecord = searchParamsToRecord(searchParams);
  const selectedId = parseAreaId(toArray(paramsRecord.areaId)[0]);
  const initial = {
    name: toArray(paramsRecord.name)[0],
    areaName: toArray(paramsRecord.areaName)[0],
    type: toArray(paramsRecord.type).find(isClimbType),
  };

  const [loadedForAreaId, setLoadedForAreaId] = useState<number | null>(null);
  const [selectedArea, setSelectedArea] = useState<SelectedAreaInfo | undefined>(undefined);

  useEffect(() => {
    if (!viewerId || !selectedId) {
      return;
    }
    const targetAreaId = selectedId;
    let cancelled = false;
    async function loadSelected() {
      try {
        const res = await fetchApi("/api/pages/climbs/new", { query: { areaId: targetAreaId } });
        if (!cancelled) {
          setSelectedArea(res.selectedArea ?? undefined);
          setLoadedForAreaId(targetAreaId);
        }
      } catch {
        if (!cancelled) {
          setSelectedArea(undefined);
          setLoadedForAreaId(targetAreaId);
        }
      }
    }
    void loadSelected();
    return () => {
      cancelled = true;
    };
  }, [viewerId, selectedId]);

  if (!viewerId) {
    return <CurrentPageAuthCallout />;
  }

  if (selectedId && loadedForAreaId !== selectedId) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-60" />
        <SkeletonListRows rows={4} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageTitle>Add a climb or area</PageTitle>
        <AddKindNav current="climb" />
      </div>
      <NewClimbForm initial={{ ...initial, area: selectedId ? selectedArea : undefined }} />
    </div>
  );
}
