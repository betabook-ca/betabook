import type { ReactNode } from "react";

import { AreaBreadcrumb } from "@/components/areas/area-breadcrumb";
import { BrokenChip } from "@/components/climbing/broken-chip";
import { DisciplineChip } from "@/components/climbing/discipline-chip";
import { Grade } from "@/components/climbing/grade";
import { GradeWithTrend } from "@/components/climbing/grade-with-trend";
import { RatingStars } from "@/components/climbing/rating-stars";
import { ListRow } from "@/components/ui/list-row";
import type { ClimbWithAreaName } from "@/lib/catalog-types";
import { formatCount } from "@/lib/format";
import { climbHref } from "@/lib/slug";

/** Catalog navigation row for area listings and full-page climb search results. */
export function CatalogClimbRow({
  climb,
  ancestors,
  stats,
  leading,
  href,
  linkLabel,
}: {
  climb: ClimbWithAreaName;
  ancestors: { id: number; name: string }[];
  stats?: { avgRating: number | null; sendCount: number; avgSuggestedGrade?: number | null };
  leading?: ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <ListRow
      as="li"
      leading={
        <div className="flex items-center gap-2">
          {leading}
          <div className="w-20 border-r border-separator pr-2">
            <Grade size="md">
              <GradeWithTrend
                stackSuggestion
                type={climb.type}
                grade={climb.grade}
                avgSuggestedGrade={stats?.avgSuggestedGrade ?? null}
              />
            </Grade>
          </div>
        </div>
      }
      wrapTitle
      title={<strong>{climb.name}</strong>}
      href={href ?? climbHref(climb.id, climb.name)}
      linkLabel={linkLabel}
      subtitle={
        <AreaBreadcrumb areaId={climb.areaId} areaName={climb.areaName} ancestors={ancestors} />
      }
      tags={
        <>
          <DisciplineChip type={climb.type} />
          {climb.brokenOn && <BrokenChip brokenOn={climb.brokenOn} />}
          <RatingStars rating={stats?.avgRating ?? null} precision="decimal" />
          <span className="text-xs text-muted">{formatCount(stats?.sendCount ?? 0, "ascent")}</span>
        </>
      }
    />
  );
}
