"use client";

import { AreaBreadcrumb } from "@/components/area-breadcrumb";
import { ClimbSentIndicator } from "@/components/climb-sent-indicator";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Grade, GradeArrow, GradeSuggestion } from "@/components/ui/grade";
import { ListRow } from "@/components/ui/list-row";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import { RatingStars } from "@/components/ui/rating-stars";
import type { ClimbWithAreaName } from "@/db/queries";
import { formatCount } from "@/lib/format";
import { describeGradeTrend } from "@/lib/grades";
import type { ClimbType } from "@/lib/grades";
import { climbHref } from "@/lib/slug";

type ClimbListProps = {
  climbs: ClimbWithAreaName[];
  emptyMessage?: string;
  /** A "load more" button shown at the bottom of the list, in place of
   * numbered pagination — same pattern as the user send list. */
  pagination?: {
    hasNextPage: boolean;
    loadingMore: boolean;
    onLoadMore: () => void;
    /** The last page fetch failed — LoadMoreButton says so and stays as the
     * retry affordance. */
    failed?: boolean;
  };
  /** Average rating, logged-ascent count, and average suggested grade per
   * climb, keyed by climb id. */
  sendStats?: Record<
    number,
    { avgRating: number | null; sendCount: number; avgSuggestedGrade: number | null }
  >;
  /** Up to two ancestor areas per climb's area, keyed by area id. */
  areaBreadcrumbs?: Record<number, { id: number; name: string }[]>;
  /** Sent climb ids among the rows loaded into this list. `undefined` means
   * no signed-in viewer, so the leading action is omitted entirely. */
  sentClimbIds?: Set<number>;
};

export function ClimbList({
  climbs,
  emptyMessage = "No climbs found.",
  pagination,
  sendStats,
  areaBreadcrumbs,
  sentClimbIds,
}: ClimbListProps) {
  if (climbs.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  const loadMoreBlock = pagination?.hasNextPage && (
    <LoadMoreButton
      onPress={pagination.onLoadMore}
      loading={pagination.loadingMore}
      failed={pagination.failed}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col divide-y divide-separator">
        {climbs.map((climb) => (
          <ListRow
            key={climb.id}
            leading={
              sentClimbIds && <ClimbSentIndicator climb={climb} sent={sentClimbIds.has(climb.id)} />
            }
            title={climb.name}
            href={climbHref(climb.id, climb.name)}
            subtitle={
              <AreaBreadcrumb
                areaId={climb.areaId}
                areaName={climb.areaName}
                ancestors={areaBreadcrumbs?.[climb.areaId] ?? []}
              />
            }
            trailing={
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-2">
                  <Grade>
                    <GradeWithTrend
                      type={climb.type}
                      grade={climb.grade}
                      avgSuggestedGrade={sendStats?.[climb.id]?.avgSuggestedGrade ?? null}
                    />
                  </Grade>
                  <span aria-hidden className="text-sm text-muted">
                    ·
                  </span>
                  <RatingStars
                    rating={sendStats?.[climb.id]?.avgRating ?? null}
                    precision="decimal"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <DisciplineChip type={climb.type} />
                  {/* Fixed width so the singular/plural swap ("1 ascent" vs
                   * "0 ascents") can't change the column's width and shift
                   * every neighbouring row's chip sideways. */}
                  <span className="w-16 text-right text-xs text-muted">
                    {formatCount(sendStats?.[climb.id]?.sendCount ?? 0, "ascent")}
                  </span>
                </div>
              </div>
            }
          />
        ))}
      </div>
      {loadMoreBlock}
    </div>
  );
}

export function GradeWithTrend({
  type,
  grade,
  avgSuggestedGrade,
}: {
  type: ClimbType;
  grade: number | null;
  avgSuggestedGrade: number | null;
}) {
  const { postedLabel, suggestedLabel, arrow } = describeGradeTrend(type, grade, avgSuggestedGrade);
  // Same arrow as a send row's feel: up is "the community grades it harder
  // than posted", down "softer" — one sign wherever a grade is compared.
  const arrowIcon =
    arrow === "up" ? (
      <GradeArrow direction="up" label="Community grades it harder" />
    ) : arrow === "down" ? (
      <GradeArrow direction="down" label="Community grades it softer" />
    ) : null;

  // One inline-flex line whoever prints it: a stat card's plain span would
  // otherwise let the block-level icon fall below the grade.
  return (
    <span className="inline-flex items-center gap-0.5">
      {postedLabel}
      {suggestedLabel == null ? (
        arrowIcon
      ) : (
        <GradeSuggestion arrow={arrowIcon}>{suggestedLabel}</GradeSuggestion>
      )}
    </span>
  );
}
