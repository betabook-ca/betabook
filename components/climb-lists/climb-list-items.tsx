"use client";

import { Button } from "@heroui/react";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { removeClimbFromList } from "@/actions";
import { AreaBreadcrumb } from "@/components/area-breadcrumb";
import { ClimbListReorder } from "@/components/climb-lists/climb-list-reorder";
import { ClimbListToolbar } from "@/components/climb-lists/climb-list-toolbar";
import { ClimbSentIndicator } from "@/components/climb-sent-indicator";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Grade } from "@/components/ui/grade";
import { GradeLabel } from "@/components/ui/grade-label";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ListRow } from "@/components/ui/list-row";
import type { AreaBreadcrumbs, ClimbListItem } from "@/db/queries";
import type { AreaSelection } from "@/lib/area-selection";
import {
  DEFAULT_CLIMB_LIST_VIEW,
  climbListViewSearch,
  isFilteredClimbList,
  isListOrder,
  type ClimbListView,
} from "@/lib/climb-lists";
import { DEFAULT_CLIMB_FILTER } from "@/lib/filters/climb-filter";
import { climbHref } from "@/lib/slug";

/**
 * A list's climbs as one reader sees them.
 *
 * The sort and Find climbs' filters are the reader's view, kept in the URL,
 * and never change the list. Every row keeps its number in the owner's order:
 * the main number in list order, a muted "#n" when sorted, so the order is
 * still readable. Sent state, and Exclude sent, are the reader's own sends; a
 * signed-out reader has none and sees neither.
 */
export function ClimbListItems({
  items,
  totalCount,
  areaBreadcrumbs,
  view,
  area = null,
  signedIn,
  listId,
  canEdit = false,
  emptyAction,
}: {
  items: ClimbListItem[];
  /** Climbs on the list before the filters, to tell an empty list from an
   * empty result. */
  totalCount: number;
  areaBreadcrumbs: AreaBreadcrumbs;
  view: ClimbListView;
  /** The area filter's name and trail, resolved on the server. */
  area?: AreaSelection | null;
  signedIn: boolean;
  /** Needed only to edit. A shared-link page leaves it out, so the page
   * sends the reader nothing but the link's token. */
  listId?: number;
  /** The owner viewing their own list: rows get a Remove button. Needs
   * `listId`. */
  canEdit?: boolean;
  /** Shown in the empty list, such as Add climbs. */
  emptyAction?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const [reordering, setReordering] = useState(false);
  const listOrder = isListOrder(view.sort);
  const filtered = isFilteredClimbList(view.filter);
  // Reordering saves the whole order, so it needs every climb, in list order.
  const wholeList = listOrder && !filtered;

  function navigate(next: ClimbListView) {
    router.replace(`${pathname}${climbListViewSearch(next)}`, { scroll: false });
  }

  const editable = canEdit && listId !== undefined;

  function remove(climbId: number) {
    if (listId === undefined) return;
    setRemoveError(null);
    setRemoving(climbId);
    startTransition(async () => {
      const result = await removeClimbFromList(listId, climbId);
      setRemoving(null);
      if (!result.ok) setRemoveError(result.error);
    });
  }

  if (totalCount === 0)
    return <EmptyState message="No climbs on this list yet." cta={emptyAction} />;

  if (reordering && wholeList && listId !== undefined)
    return <ClimbListReorder items={items} listId={listId} onClose={() => setReordering(false)} />;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ClimbListToolbar view={view} area={area} signedIn={signedIn} />

      {editable && totalCount > 1 && (
        <div className="flex justify-end">
          {wholeList ? (
            <Button variant="outline" onPress={() => setReordering(true)}>
              Reorder
            </Button>
          ) : (
            <Button variant="ghost" onPress={() => navigate(DEFAULT_CLIMB_LIST_VIEW)}>
              {filtered ? "Clear filters to reorder" : "Switch to list order to reorder"}
            </Button>
          )}
        </div>
      )}

      {removeError && <InlineAlert>{removeError}</InlineAlert>}

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
                <div className="flex items-center gap-1">
                  <span
                    className={clsx(
                      "w-8 shrink-0 text-right text-sm tabular-nums",
                      listOrder ? "font-medium text-foreground" : "text-muted",
                    )}
                  >
                    <span className="sr-only">Number </span>
                    {listOrder ? item.number : `#${item.number}`}
                  </span>
                  {item.sent !== null && (
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
                  )}
                </div>
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
              actions={
                editable && (
                  <Button
                    isIconOnly
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${item.name} from this list`}
                    isDisabled={removing === item.climbId}
                    onPress={() => remove(item.climbId)}
                  >
                    <X className="size-4" />
                  </Button>
                )
              }
            />
          ))}
        </ol>
      )}
    </div>
  );
}
