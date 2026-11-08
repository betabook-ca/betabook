"use client";

import { Button } from "@heroui/react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { AreaBreadcrumb } from "@/components/area-breadcrumb";
import { useClimbListEditControl } from "@/components/climb-lists/climb-list-editing";
import { ClimbListEditor } from "@/components/climb-lists/climb-list-editor";
import { ClimbListToolbar } from "@/components/climb-lists/climb-list-toolbar";
import { ClimbSentIndicator } from "@/components/climb-sent-indicator";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Grade } from "@/components/ui/grade";
import { GradeLabel } from "@/components/ui/grade-label";
import { ListRow } from "@/components/ui/list-row";
import type { AreaBreadcrumbs, ClimbListItem } from "@/db/queries";
import {
  DEFAULT_CLIMB_LIST_VIEW,
  climbListViewSearch,
  isFilteredClimbList,
  isCircuitSort,
  type ClimbListView,
} from "@/lib/climb-lists";
import { DEFAULT_CLIMB_FILTER } from "@/lib/filters/climb-filter";
import { climbHref } from "@/lib/slug";

/**
 * A list's climbs as one reader sees them.
 *
 * The sort and filters (disciplines, grades, rating, ascents, Exclude sent)
 * are the reader's view, kept in the URL,
 * and never change the list. Rows carry no number, so the climb name gets the
 * width on a phone; the numbers show only in the Edit view. Sent state,
 * and Exclude sent, are the reader's own sends; a signed-out reader has none
 * and sees neither.
 */
export function ClimbListItems({
  items,
  totalCount,
  areaBreadcrumbs,
  view,
  signedIn,
  listId,
  canEdit = false,
  listTitle = "",
}: {
  items: ClimbListItem[];
  /** Climbs on the list before the filters, to tell an empty list from an
   * empty result. */
  totalCount: number;
  areaBreadcrumbs: AreaBreadcrumbs;
  view: ClimbListView;
  signedIn: boolean;
  /** Needed only to edit. A shared-link page leaves it out, so the page
   * sends the reader nothing but the link's token. */
  listId?: number;
  /** The owner viewing their own list: the header's Edit opens the editor,
   * where climbs are added, reordered and removed. Needs `listId` and a
   * `ClimbListEditingProvider` around the header and the list. */
  canEdit?: boolean;
  /** Names the list in the editor's Add climbs dialog. */
  listTitle?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [editing, setEditing] = useState(false);
  // Editing saves the whole order, so it needs every climb, in circuit order.
  const wholeList = isCircuitSort(view.sort) && !isFilteredClimbList(view.filter);
  // Choosing Edit on a sorted or filtered view navigates to the plain list
  // first. If the view then lands anywhere else, the request lapses, so the
  // editor never opens later on its own.
  const viewKey = climbListViewSearch(view);
  const [seenViewKey, setSeenViewKey] = useState(viewKey);
  if (viewKey !== seenViewKey) {
    setSeenViewKey(viewKey);
    if (!wholeList) setEditing(false);
  }

  function navigate(next: ClimbListView) {
    router.replace(`${pathname}${climbListViewSearch(next)}`, { scroll: false });
  }

  const editable = canEdit && listId !== undefined;

  // The header's Edit opens the editor here. The editor saves every climb in
  // order, so it opens on the plain list: a sorted or filtered view switches
  // back first. The editor's own Add climbs is the one way to add climbs.
  useClimbListEditControl(
    editing,
    editable
      ? () => {
          if (!wholeList) navigate(DEFAULT_CLIMB_LIST_VIEW);
          setEditing(true);
        }
      : null,
  );

  // The editor stays open even if the list empties, so it never closes
  // behind the owner's back and reopens on its own when a climb arrives.
  if (editing && wholeList && listId !== undefined)
    return (
      <ClimbListEditor
        items={items}
        listId={listId}
        listTitle={listTitle}
        onClose={() => setEditing(false)}
      />
    );

  if (totalCount === 0)
    return (
      <EmptyState
        message={
          editable
            ? "No climbs on this list yet. Choose Edit to add some."
            : "No climbs on this list yet."
        }
      />
    );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ClimbListToolbar view={view} signedIn={signedIn} />
      {items.length === 0 ? (
        <EmptyState
          message="No climbs on this list match these filters."
          cta={
            <Button
              variant="outline"
              onPress={() => navigate({ sort: view.sort, filter: DEFAULT_CLIMB_FILTER })}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <ol className="flex flex-col divide-y divide-separator">
          {items.map((item) => (
            <ListRow
              key={item.climbId}
              as="li"
              leading={
                item.sent !== null && (
                  <ClimbSentIndicator
                    climb={{
                      id: item.climbId,
                      name: item.name,
                      areaId: item.areaId,
                      type: item.type,
                      grade: item.grade,
                      brokenOn: item.brokenOn,
                    }}
                    sent={item.sent}
                  />
                )
              }
              title={item.name}
              href={climbHref(item.climbId, item.name)}
              subtitle={
                <AreaBreadcrumb
                  areaId={item.areaId}
                  areaName={item.areaName}
                  ancestors={areaBreadcrumbs[item.areaId] ?? []}
                />
              }
              trailing={
                <div className="flex flex-col items-end gap-1.5">
                  <Grade>
                    <GradeLabel type={item.type} grade={item.grade} />
                  </Grade>
                  <DisciplineChip type={item.type} />
                </div>
              }
            />
          ))}
        </ol>
      )}
    </div>
  );
}
