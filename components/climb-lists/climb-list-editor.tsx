"use client";

import { Button, useOverlayState } from "@heroui/react";
import { CirclePlus, GripVertical, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { DropIndicator, GridList, GridListItem, useDragAndDrop } from "react-aria-components";

import { saveClimbListEdits } from "@/actions";
import { AddClimbsDialog } from "@/components/climb-lists/add-climbs-dialog";
import { cardClass } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { ClimbListItem, ClimbWithAreaName } from "@/db/queries";
import { CLIMB_LIST_FULL_MESSAGE, MAX_CLIMB_LIST_ITEMS, moveClimb } from "@/lib/climb-lists";

/** While there are unsaved edits, holds the page from going away. Reloading,
 * closing the tab or leaving the site gets the browser's own prompt
 * (`beforeunload`). A plain click on a link, which in the app is a client
 * navigation that would drop the editor without unloading anything, is
 * cancelled in the capture phase, before Next's own link handler, and handed
 * to `onLeave` so the editor can ask. Clicks that open a new tab or window are
 * left alone. The browser's Back button can't be held this way. */
function useLeaveGuard(
  active: boolean,
  onLeave: (href: string) => void,
  leaving: { current: boolean },
) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!leaving.current) event.preventDefault();
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.getAttribute("target") ?? "_self") !== "_self") return;
      event.preventDefault();
      event.stopPropagation();
      onLeave(link.href);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [active, onLeave, leaving]);
}

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
 * climbs off with Remove, and add them with Add climbs at the bottom, up to
 * `MAX_CLIMB_LIST_ITEMS`. Nothing is written until Save, which sends the
 * resulting order once and writes exactly what the owner sees, whatever
 * another tab did in the meantime (see `saveClimbListEdits`). Cancel drops
 * every staged change. Every control is disabled while a save is in flight,
 * so nothing staged then is lost when the editor closes. Leaving the page
 * with unsaved edits asks first (see `useLeaveGuard`).
 *
 * The editor works from `items` as they were when it opened. A refresh while
 * it is open (say, after renaming the list) brings new `items`, but the rows,
 * the order Save sends and whether anything changed all keep using that first
 * copy, so the editor always shows exactly what Save will write.
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
  const router = useRouter();
  const addState = useOverlayState();
  const leaveState = useOverlayState();
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const leaving = useRef(false);
  const [opened] = useState(items);
  const [order, setOrder] = useState(() => opened.map((item) => item.climbId));
  const [removed, setRemoved] = useState<number[]>([]);
  const [added, setAdded] = useState<ClimbListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = new Map([...opened, ...added].map((item) => [item.climbId, item]));
  const rows = order.flatMap((id) => byId.get(id) ?? []);
  // Each row's number, looked up once per render rather than by indexOf.
  const indexById = new Map(order.map((id, index) => [id, index]));
  const changed =
    removed.length > 0 ||
    added.length > 0 ||
    order.length !== opened.length ||
    order.some((id, index) => id !== opened[index]?.climbId);
  // Staged edits live only here until Save, so leaving would drop them.
  const askToLeave = useCallback(
    (href: string) => {
      setLeaveTo(href);
      leaveState.open();
    },
    [leaveState],
  );
  useLeaveGuard(changed && !pending, askToLeave, leaving);

  function leave() {
    if (leaveTo === null) return;
    const url = new URL(leaveTo, window.location.href);
    leaving.current = true;
    leaveState.close();
    if (url.origin === window.location.origin)
      router.push(`${url.pathname}${url.search}${url.hash}`);
    else window.location.assign(url);
  }

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

  /** Stages a picked climb, or returns why it can't be. */
  function stage(climb: ClimbWithAreaName): string | null {
    if (indexById.has(climb.id)) return null;
    if (order.length >= MAX_CLIMB_LIST_ITEMS) return CLIMB_LIST_FULL_MESSAGE;
    setOrder((current) =>
      current.includes(climb.id) || current.length >= MAX_CLIMB_LIST_ITEMS
        ? current
        : [...current, climb.id],
    );
    // Re-adding a climb staged for removal just keeps it.
    if (removed.includes(climb.id)) {
      setRemoved((current) => current.filter((id) => id !== climb.id));
      return null;
    }
    // Two quick picks both land before a re-render: stage the climb once.
    setAdded((current) =>
      current.some((item) => item.climbId === climb.id) ? current : [...current, stagedItem(climb)],
    );
    return null;
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
      const result = await saveClimbListEdits(listId, order);
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
          const index = indexById.get(item.climbId) ?? 0;
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
      <ConfirmDialog
        state={leaveState}
        title="Leave without saving?"
        description="Your changes to this list will be lost."
        confirmLabel="Leave"
        cancelLabel="Stay"
        isPending={false}
        onConfirm={leave}
        onClose={() => setLeaveTo(null)}
      />
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
