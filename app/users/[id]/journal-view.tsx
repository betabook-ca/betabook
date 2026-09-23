import { JournalFilterToolbar, JournalTimeline } from "@/components/journal";
import { NavigationPendingProvider } from "@/components/navigation-pending";
import { ProductTour } from "@/components/product-tour";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import {
  getAreaBreadcrumbs,
  getClimb,
  hasJournalEntries,
  getJournalPage,
  getProductTourState,
} from "@/db/queries";
import { getUserHashtags } from "@/db/queries/hashtag-filter";
import { getJournalFilterFriends } from "@/db/queries/journal-companions";
import type { JournalFilter } from "@/lib/filters/journal-filter";

export async function JournalView({
  ownerId,
  viewerId,
  filter: requestedFilter,
  basePath,
  lockedDateRange = false,
}: {
  ownerId: string;
  viewerId: string;
  filter: JournalFilter;
  /** Where the filter toolbar's links point, for the trip view that mounts
   * this same timeline under its own route. */
  basePath?: string;
  lockedDateRange?: boolean;
}) {
  const db = await getDb();
  const isOwner = viewerId === ownerId;
  const filter = isOwner ? requestedFilter : { ...requestedFilter, friendIds: [] };
  // The guided tour teaches the climber to keep a journal, and it anchors on
  // this page's own controls. A trip mounts the same timeline under a
  // different route with its dates pinned, which is neither the place to
  // start that lesson nor a page its steps can point at.
  const isMainJournal = basePath == null;

  const [hasEntries, firstPage, filteredClimb, tourState, tags, friends] = await Promise.all([
    hasJournalEntries(db, ownerId, viewerId),
    getJournalPage(db, ownerId, viewerId, filter),
    filter.climbId === null ? Promise.resolve(null) : getClimb(db, filter.climbId),
    isOwner && isMainJournal ? getProductTourState(db, ownerId) : Promise.resolve(null),
    getUserHashtags(db, ownerId, viewerId, false, true),
    isOwner ? getJournalFilterFriends(db, ownerId) : Promise.resolve([]),
  ]);
  const areaBreadcrumbs = await getAreaBreadcrumbs(
    db,
    firstPage.entries.flatMap((entry) => (entry.areaId == null ? [] : [entry.areaId])),
  );

  return (
    <NavigationPendingProvider>
      <div className="flex min-w-0 flex-col gap-4">
        {tourState && <ProductTour initialState={tourState} />}
        <SectionHeading className="sr-only">Journal</SectionHeading>
        {hasEntries && (
          <JournalFilterToolbar
            userId={ownerId}
            tags={tags}
            isOwner={isOwner}
            friends={friends}
            filter={filter}
            climbName={filteredClimb?.name ?? null}
            basePath={basePath}
            lockedDateRange={lockedDateRange}
          />
        )}
        <JournalTimeline
          key={JSON.stringify(filter)}
          userId={ownerId}
          filter={filter}
          initialEntries={firstPage.entries}
          initialHasMore={firstPage.hasMore}
          initialAreaBreadcrumbs={areaBreadcrumbs}
          isOwner={isOwner}
          hasAnyEntries={hasEntries}
        />
      </div>
    </NavigationPendingProvider>
  );
}
