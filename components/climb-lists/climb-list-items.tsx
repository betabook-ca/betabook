"use client";

import { Button, Menu } from "@heroui/react";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { AreaBreadcrumb } from "@/components/area-breadcrumb";
import { AddClimbsButton } from "@/components/climb-lists/add-climbs-button";
import { ClimbListEditor } from "@/components/climb-lists/climb-list-editor";
import { ClimbListToolbar } from "@/components/climb-lists/climb-list-toolbar";
import { ClimbSentIndicator } from "@/components/climb-sent-indicator";
import { ActionsMenu } from "@/components/ui/actions-menu";
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
  addClimbs,
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
  /** The owner viewing their own list: the ⋯ menu offers Edit, where
   * climbs are reordered, removed and added. Needs `listId`. */
  canEdit?: boolean;
  /** The owner's Add climbs button, above the list. Its picker needs every
   * climb on the list, filtered or not, to mark what is already there. */
  addClimbs?: { listTitle: string; climbIds: readonly number[]; variant?: "outline" };
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

  // One Add climbs button in one place, whatever the list shows below it:
  // its dialog lives inside it, so a button that moved when the first climb
  // arrived would unmount the dialog and close it mid-add. Disabled while
  // editing, where the editor's own Add climbs stages climbs until Save.
  function frame(content: ReactNode) {
    return (
      <div className="flex min-w-0 flex-col gap-3">
        {addClimbs && listId !== undefined && (
          <div className="self-end">
            <AddClimbsButton
              listId={listId}
              listTitle={addClimbs.listTitle}
              climbIds={addClimbs.climbIds}
              variant={addClimbs.variant}
              isDisabled={editing}
            />
          </div>
        )}
        {content}
      </div>
    );
  }

  // The editor stays open even if the list empties, so it never closes
  // behind the owner's back and reopens on its own when a climb arrives.
  if (editing && wholeList && listId !== undefined)
    return frame(
      <ClimbListEditor
        items={items}
        listId={listId}
        listTitle={addClimbs?.listTitle ?? ""}
        onClose={() => setEditing(false)}
      />,
    );

  if (totalCount === 0) return frame(<EmptyState message="No climbs on this list yet." />);

  return frame(
    <div className="flex min-w-0 flex-col gap-3">
      <ClimbListToolbar
        view={view}
        signedIn={signedIn}
        menu={
          editable && (
            <ActionsMenu
              ariaLabel="List actions"
              onAction={(key) => {
                if (key !== "edit") return;
                // The editor saves every climb in order, so it opens on the
                // plain list: a sorted or filtered view switches back first.
                if (!wholeList) navigate(DEFAULT_CLIMB_LIST_VIEW);
                setEditing(true);
              }}
            >
              <Menu.Item id="edit">Edit</Menu.Item>
            </ActionsMenu>
          )
        }
      />

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
    </div>,
  );
}
