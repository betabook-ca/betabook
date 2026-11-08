"use client";

import { Button } from "@heroui/react";
import { ArrowDown, ArrowUp, GripVertical, X } from "lucide-react";
import { useState, useTransition } from "react";
import { DropIndicator, GridList, GridListItem, useDragAndDrop } from "react-aria-components";

import { saveClimbListEdits } from "@/actions";
import { cardClass } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { ClimbListItem } from "@/db/queries";
import { moveClimb } from "@/lib/climb-lists";

/**
 * The owner's list editor: drag a row by its handle, or use the arrow
 * buttons, which are also the keyboard and touch path, and take climbs off
 * with Remove. Nothing is written until Save, which sends the order and the
 * removed climbs once; the server refuses it if the list changed in the
 * meantime, rather than half-applying it. Cancel puts removed climbs back.
 *
 * `items` must be the whole list in list order. The list page opens this only
 * in list order with no filter, so the order it saves has every climb in it.
 */
export function ClimbListReorder({
  items,
  listId,
  onClose,
}: {
  items: ClimbListItem[];
  listId: number;
  onClose: () => void;
}) {
  const [order, setOrder] = useState(() => items.map((item) => item.climbId));
  const [removed, setRemoved] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const byId = new Map(items.map((item) => [item.climbId, item]));
  const rows = order.flatMap((id) => byId.get(id) ?? []);
  const changed = removed.length > 0 || order.some((id, index) => id !== items[index]?.climbId);

  function remove(climbId: number) {
    setOrder((current) => current.filter((id) => id !== climbId));
    setRemoved((current) => [...current, climbId]);
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
      const result = await saveClimbListEdits(listId, order, removed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Drag climbs by the handle, or use the arrows. Nothing changes until you save.
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
        aria-label="Reorder climbs"
        items={rows}
        dependencies={[order]}
        selectionMode="none"
        dragAndDropHooks={dragAndDropHooks}
        renderEmptyState={() => (
          <p className="px-2 py-4 text-sm text-muted">Every climb will be removed.</p>
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
                aria-label={`Move ${item.name} earlier`}
                isDisabled={pending || index === 0}
                onPress={() =>
                  setOrder((current) => moveClimb(current, item.climbId, current[index - 1]))
                }
              >
                <ArrowUp size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                aria-label={`Move ${item.name} later`}
                isDisabled={pending || index === order.length - 1}
                onPress={() =>
                  setOrder((current) =>
                    moveClimb(current, item.climbId, current[index + 1], "after"),
                  )
                }
              >
                <ArrowDown size={14} />
              </Button>
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
    </div>
  );
}
