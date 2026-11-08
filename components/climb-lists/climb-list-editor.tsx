"use client";

import { Button, useOverlayState } from "@heroui/react";
import { CirclePlus, GripVertical, X } from "lucide-react";
import { useState, useTransition } from "react";
import { DropIndicator, GridList, GridListItem, useDragAndDrop } from "react-aria-components";

import { saveClimbListEdits } from "@/actions";
import { AddClimbsDialog } from "@/components/climb-lists/add-climbs-dialog";
import { cardClass } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { ClimbListItem, ClimbWithAreaName } from "@/db/queries";
import { moveClimb } from "@/lib/climb-lists";

/** A climb picked in the editor, shaped like a list row until Save adds it. */
function stagedItem(climb: ClimbWithAreaName): ClimbListItem {
  return {
    climbId: climb.id,
    name: climb.name,
    type: climb.type,
    grade: climb.grade,
    areaId: climb.areaId,
    areaName: climb.areaName,
    brokenOn: climb.brokenOn,
    position: 0,
    addedAt: 0,
    sent: null,
  };
}

/**
 * The owner's list editor: drag a row by its handle to reorder it
 * (react-aria's drag and drop also works from the keyboard: Enter on the
 * handle picks a climb up, the arrow keys move it, Enter drops it); take
 * climbs off with Remove, and add them with Add climbs at the bottom. Nothing is written until
 * Save, which sends the order, the removed climbs and the added ones once.
 * Save writes exactly what the owner sees, whatever another tab did in the
 * meantime (see `saveClimbListEdits`). Cancel drops every staged change. Every control is
 * disabled while a save is in flight, so nothing staged then is lost when the
 * editor closes.
 *
 * `items` must be the whole list in circuit order. The list page opens this
 * only in circuit order with no filter, so the order it saves has every climb
 * in it.
 */
export function ClimbListEditor({
  items,
  listId,
  listTitle,
  onClose,
}: {
  items: ClimbListItem[];
  listId: number;
  listTitle: string;
  onClose: () => void;
}) {
  const addState = useOverlayState();
  const [order, setOrder] = useState(() => items.map((item) => item.climbId));
  const [removed, setRemoved] = useState<number[]>([]);
  const [added, setAdded] = useState<ClimbListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = new Map([...items, ...added].map((item) => [item.climbId, item]));
  const rows = order.flatMap((id) => byId.get(id) ?? []);
  const changed =
    removed.length > 0 ||
    added.length > 0 ||
    order.some((id, index) => id !== items[index]?.climbId);

  function remove(climbId: number) {
    setOrder((current) => current.filter((id) => id !== climbId));
    // A climb added here just goes back; one already on the list is staged
    // for removal, once, even when a double tap presses twice.
    if (added.some((item) => item.climbId === climbId)) {
      setAdded((current) => current.filter((item) => item.climbId !== climbId));
      return;
    }
    setRemoved((current) => (current.includes(climbId) ? current : [...current, climbId]));
  }

  function stage(climb: ClimbWithAreaName) {
    if (order.includes(climb.id)) return;
    setOrder((current) => (current.includes(climb.id) ? current : [...current, climb.id]));
    // Re-adding a climb staged for removal just keeps it.
    if (removed.includes(climb.id)) {
      setRemoved((current) => current.filter((id) => id !== climb.id));
      return;
    }
    // Two quick picks both land before a re-render: stage the climb once.
    setAdded((current) =>
      current.some((item) => item.climbId === climb.id) ? current : [...current, stagedItem(climb)],
    );
  }

  const { dragAndDropHooks } = useDragAndDrop<ClimbListItem>({
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
    renderDragPreview: (dragged) => (
      <div
        className={`flex items-center gap-3 border border-accent ${cardClass("sm", "floating")}`}
      >
        <GripVertical size={18} />
        <span className="text-sm font-medium">
          {byId.get(Number(dragged[0]?.["text/plain"]))?.name}
        </span>
      </div>
    ),
    renderDropIndicator: (target) => (
      <DropIndicator target={target} className="h-0.5 rounded-full data-[drop-target]:bg-accent" />
    ),
    onReorder: (event) => {
      if (pending) return;
      const source = Number([...event.keys][0]);
      const target = Number(event.target.key);
      setOrder((current) =>
        moveClimb(
          current,
          source,
          target,
          event.target.dropPosition === "after" ? "after" : "before",
        ),
      );
    },
  });

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveClimbListEdits(
        listId,
        order,
        removed,
        added.map((item) => item.climbId),
      );
      if (result.ok) onClose();
      else setError(result.error);
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Drag climbs by the handle to reorder them. Nothing changes until you save.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" isDisabled={pending} onPress={onClose}>
            Cancel
          </Button>
          <Button isDisabled={pending || !changed} onPress={save}>
            Save
          </Button>
        </div>
      </div>
      {error && <InlineAlert>{error}</InlineAlert>}
      <GridList
        aria-label="Edit climbs"
        items={rows}
        // Rows re-render when a save starts, so their controls disable.
        dependencies={[order, pending]}
        selectionMode="none"
        dragAndDropHooks={dragAndDropHooks}
        renderEmptyState={() => (
          <p className="px-2 py-4 text-sm text-muted">
            {removed.length > 0 ? "Every climb will be removed." : "No climbs on this list yet."}
          </p>
        )}
        className="flex flex-col divide-y divide-separator"
      >
        {(item) => {
          const index = order.indexOf(item.climbId);
          return (
            <GridListItem
              id={item.climbId}
              textValue={item.name}
              className="flex items-center gap-2 px-2 py-2 outline-none data-[dragging]:opacity-30 data-[focus-visible]:status-focused"
            >
              <Button
                slot="drag"
                variant="ghost"
                size="sm"
                isIconOnly
                className="cursor-grab active:cursor-grabbing"
                aria-label={`Drag ${item.name}`}
                isDisabled={pending}
              >
                <GripVertical size={16} />
              </Button>
              <span className="w-8 shrink-0 text-left text-sm font-medium tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.name}</span>
                <span className="block truncate text-sm text-muted">{item.areaName}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                aria-label={`Remove ${item.name} from this list`}
                isDisabled={pending}
                onPress={() => remove(item.climbId)}
              >
                <X size={14} />
              </Button>
            </GridListItem>
          );
        }}
      </GridList>
      <Button variant="outline" className="self-start" isDisabled={pending} onPress={addState.open}>
        <CirclePlus className="size-4" />
        Add climbs
      </Button>
      <AddClimbsDialog
        state={addState}
        listId={listId}
        listTitle={listTitle}
        climbIds={order}
        onStage={stage}
      />
    </div>
  );
}
