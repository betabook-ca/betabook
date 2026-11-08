"use client";

import { Button } from "@heroui/react";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { removeClimbFromList } from "@/actions";
import { AreaBreadcrumb } from "@/components/area-breadcrumb";
import { ClimbListReorder } from "@/components/climb-lists/climb-list-reorder";
import { ClimbSentIndicator } from "@/components/climb-sent-indicator";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Grade } from "@/components/ui/grade";
import { GradeLabel } from "@/components/ui/grade-label";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ListRow } from "@/components/ui/list-row";
import { SegmentedButtons } from "@/components/ui/segmented-buttons";
import { SortSelect } from "@/components/ui/sort-select";
import type { AreaBreadcrumbs, ClimbListItem } from "@/db/queries";
import {
  CLIMB_LIST_SORT_DIRECTION,
  CLIMB_LIST_SORT_OPTIONS,
  climbListViewSearch,
  isListOrder,
  type ClimbListSentFilter,
  type ClimbListSort,
  type ClimbListView,
} from "@/lib/climb-lists";
import { climbHref } from "@/lib/slug";

const SENT_OPTIONS: { value: ClimbListSentFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unsent", label: "Unsent" },
  { value: "sent", label: "Sent" },
];

/** What a filter that matches nothing says. Sent state is the reader's own. */
const FILTER_EMPTY: Record<Exclude<ClimbListSentFilter, "all">, string> = {
  unsent: "You've sent every climb on this list.",
  sent: "You haven't sent any climbs on this list yet.",
};

/**
 * A list's climbs as one reader sees them.
 *
 * Sorting and the sent filter are the reader's view, kept in the URL, and
 * never change the list. Every row keeps its number in the owner's order:
 * the main number in list order, a muted "#n" when sorted, so the order is
 * still readable. Sent state, and the filter, are the reader's own sends;
 * a signed-out reader has none and sees neither.
 */
export function ClimbListItems({
  items,
  totalCount,
  areaBreadcrumbs,
  view,
  signedIn,
  listId,
  canEdit = false,
  emptyAction,
}: {
  items: ClimbListItem[];
  /** Climbs on the list before the filter, to tell an empty list from an
   * empty filter. */
  totalCount: number;
  areaBreadcrumbs: AreaBreadcrumbs;
  view: ClimbListView;
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
  // Reordering saves the whole order, so it needs every climb, in list order.
  const wholeList = listOrder && view.sent === "all";

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SortSelect
          sort={view.sort}
          fields={CLIMB_LIST_SORT_OPTIONS}
          defaultField="position"
          defaultDirection={CLIMB_LIST_SORT_DIRECTION}
          onNavigate={(sort: ClimbListSort) => navigate({ ...view, sort })}
        />
        <div className="flex flex-wrap items-center gap-3">
          {signedIn && (
            <SegmentedButtons
              ariaLabel="Show climbs you've sent"
              className="w-auto"
              value={view.sent}
              options={SENT_OPTIONS}
              onChange={(sent) => navigate({ ...view, sent })}
            />
          )}
          {editable &&
            totalCount > 1 &&
            (wholeList ? (
              <Button variant="outline" onPress={() => setReordering(true)}>
                Reorder
              </Button>
            ) : (
              <Button
                variant="ghost"
                onPress={() => navigate({ sort: "position_asc", sent: "all" })}
              >
                Switch to list order to reorder
              </Button>
            ))}
        </div>
      </div>

      {removeError && <InlineAlert>{removeError}</InlineAlert>}

      {items.length === 0 && view.sent !== "all" ? (
        <EmptyState
          message={FILTER_EMPTY[view.sent]}
          cta={
            <Button variant="outline" onPress={() => navigate({ ...view, sent: "all" })}>
              Clear filter
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
