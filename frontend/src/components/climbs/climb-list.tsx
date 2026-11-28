import { CatalogClimbRow } from "@/components/climbs/catalog-climb-row";
import { ClimbSentIndicator } from "@/components/sends/climb-sent-indicator";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import { RowList } from "@/components/ui/row-list";
import type { ClimbWithAreaName } from "@/lib/catalog-types";

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
      <RowList>
        {climbs.map((climb) => (
          <CatalogClimbRow
            key={climb.id}
            climb={climb}
            ancestors={areaBreadcrumbs?.[climb.areaId] ?? []}
            stats={sendStats?.[climb.id]}
            leading={
              sentClimbIds && <ClimbSentIndicator climb={climb} sent={sentClimbIds.has(climb.id)} />
            }
          />
        ))}
      </RowList>
      {loadMoreBlock}
    </div>
  );
}
