import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";

import { ClimbHeader } from "@/app/climbs/[id]/[[...slug]]/climb-header";
import { AreaBreadcrumbs } from "@/components/breadcrumbs";
import { ClimbVideoShelf } from "@/components/climb-video-shelf";
import { PublicClimbSendList } from "@/components/public-climb-send-list";
import { RatingStars } from "@/components/ui/rating-stars";
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
import { StatStrip } from "@/components/ui/stat-strip";
import { PageTitle, SectionHeading } from "@/components/ui/typography";
import type { ClimbVideos } from "@/db/queries";
import { missingDescriptionMessage } from "@/lib/descriptions";
import type { PublicAreaDetails, PublicClimb, PublicClimbSend } from "@/lib/public-catalog";
import { climbHref, withQuery } from "@/lib/slug";
import { searchParamsToRecord } from "@/lib/url-params";
import { peekBootstrapData } from "@/spa/bootstrap";
import { fetchJson, parsePositiveId, type ClimbPageData } from "@/spa/lib/fetch-json";
import { usePathname } from "@/spa/shims/next-navigation";

export default function ClimbRoute() {
  const params = useParams<{ id?: string }>();
  const pathname = usePathname();
  const [searchParams] = useSearchParams();
  const climbId = parsePositiveId(params.id);

  const [data, setData] = useState<ClimbPageData | null>(() => {
    if (climbId === null) {
      return null;
    }
    const bootstrapped = peekBootstrapData("climb", pathname) as ClimbPageData | null;
    return bootstrapped && bootstrapped.climbId === climbId ? bootstrapped : null;
  });
  const [error, setError] = useState<string | null>(null);

  const hasCurrentData = data !== null && climbId !== null && data.climbId === climbId;

  useEffect(() => {
    if (climbId === null || hasCurrentData) {
      return;
    }
    const targetId = climbId;
    let cancelled = false;
    async function loadClimb() {
      try {
        const res = await fetchJson<{
          climb: PublicClimb;
          area: PublicAreaDetails | null;
          ancestors: PublicAreaDetails[];
          publicSends: PublicClimbSend[];
          videos?: ClimbVideos;
        }>(`/api/public/climbs/${targetId}`);
        if (!cancelled) {
          setError(null);
          setData({
            climbId: targetId,
            climb: res.climb,
            area: res.area,
            ancestors: res.ancestors,
            publicSends: res.publicSends,
            videos: res.videos ?? { videos: [], total: 0 },
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load climb");
        }
      }
    }
    void loadClimb();
    return () => {
      cancelled = true;
    };
  }, [climbId, hasCurrentData]);

  if (climbId === null) {
    return (
      <div className="py-8 text-center">
        <PageTitle>Climb not found</PageTitle>
        <p className="mt-2 text-sm text-muted">No route or boulder problem exists at this URL.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-border bg-surface p-6 text-danger">
        {error}
      </div>
    );
  }
  if (!hasCurrentData) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-9 w-72" />
        <SkeletonListRows rows={6} />
      </div>
    );
  }

  const path = climbHref(data.climb.id, data.climb.name);
  const breadcrumbAncestors = data.area ? [...data.ancestors, data.area] : data.ancestors;
  const searchRecord = searchParamsToRecord(searchParams);

  return (
    <div className="flex flex-col gap-6">
      <AreaBreadcrumbs ancestors={breadcrumbAncestors} current={data.climb} />
      <ClimbHeader climb={data.climb}>
        <p className="mt-1 text-muted">{data.climb.description || missingDescriptionMessage()}</p>
      </ClimbHeader>
      <StatStrip
        cards={[
          {
            key: "summary",
            stats: [
              {
                label: "Community rating",
                value: <RatingStars rating={data.climb.avgRating} precision="decimal" />,
              },
              { label: "Logged ascents", value: data.climb.sendCount },
            ],
          },
        ]}
      />
      <ClimbVideoShelf
        videos={data.videos.videos}
        total={data.videos.total}
        climbName={data.climb.name}
      />
      <div className="flex flex-col gap-3">
        <SectionHeading>Sends</SectionHeading>
        <PublicClimbSendList
          type={data.climb.type}
          climbName={data.climb.name}
          sends={data.publicSends}
          next={withQuery(path, searchRecord)}
        />
      </div>
    </div>
  );
}
