import { createContext, use, useRef, useState, type PointerEvent, type RefObject } from "react";

/** Long enough that a tap or the start of a scroll never opens the menu; about
 * where iOS and Android open their own context menus. */
const LONG_PRESS_MS = 500;
/** A finger drifting further than this is scrolling, not holding. */
const MOVE_TOLERANCE_PX = 10;

type RowActions = {
  register: (open: () => void) => () => void;
  /** A zero-size point inside the row, moved to the finger before opening. */
  anchorRef: RefObject<HTMLSpanElement | null>;
};

const RowActionsContext = createContext<RowActions | null>(null);

export const RowActionsProvider = RowActionsContext;

export function useRowActions() {
  return use(RowActionsContext);
}

/** Lets a touch user long-press anywhere on a row to open its actions menu,
 * as a shortcut beside the row's edit button. The menu registers itself
 * through the returned context; until one does, the row behaves as before. */
export function useLongPressRow() {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const openRef = useRef<(() => void) | null>(null);
  const pressRef = useRef<{ id: number; x: number; y: number; timer: number } | null>(null);
  // The touch that opened the menu still ends in a click, which would follow
  // the row's link.
  const swallowClickRef = useRef(false);
  const [pressing, setPressing] = useState(false);
  const [hasMenu, setHasMenu] = useState(false);
  const [context] = useState<RowActions>(() => ({
    anchorRef,
    register(open) {
      openRef.current = open;
      setHasMenu(true);
      return () => {
        if (openRef.current !== open) return;
        openRef.current = null;
        setHasMenu(false);
      };
    },
  }));

  function cancel() {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
    setPressing(false);
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    swallowClickRef.current = false;
    // React bubbles events from portals through the tree, so a press inside
    // the row's own edit drawer would otherwise reach the row.
    const row = event.currentTarget;
    if (
      event.pointerType !== "touch" ||
      !event.isPrimary ||
      !openRef.current ||
      !(event.target instanceof Node && row.contains(event.target))
    )
      return;
    cancel();
    const { clientX: x, clientY: y, pointerId: id } = event;
    const timer = window.setTimeout(() => {
      pressRef.current = null;
      setPressing(false);
      const anchor = anchorRef.current;
      if (anchor) {
        const rect = row.getBoundingClientRect();
        anchor.style.left = `${x - rect.left}px`;
        anchor.style.top = `${y - rect.top}px`;
      }
      swallowClickRef.current = true;
      navigator.vibrate?.(10);
      openRef.current?.();
    }, LONG_PRESS_MS);
    pressRef.current = { id, x, y, timer };
    setPressing(true);
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const press = pressRef.current;
    if (press?.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > MOVE_TOLERANCE_PX) cancel();
  }

  const rowProps = hasMenu
    ? {
        "data-long-press": "",
        "data-pressing": pressing ? "" : undefined,
        onPointerDown,
        onPointerMove,
        onPointerUp: cancel,
        onPointerCancel: cancel,
        onClickCapture(event: { preventDefault(): void; stopPropagation(): void }) {
          if (!swallowClickRef.current) return;
          swallowClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        },
        // Android's own long-press menu for the row's link.
        onContextMenu(event: { preventDefault(): void }) {
          if (pressRef.current || swallowClickRef.current) event.preventDefault();
        },
      }
    : {};

  const anchor = hasMenu ? (
    <span
      ref={anchorRef}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 size-0"
    />
  ) : null;

  return { context, hasMenu, rowProps, anchor };
}

/** Names the row for its actions button, which pointer screens reveal on
 * hover. On touch screens: no text selection or link preview to compete with
 * the hold, and a highlight that fades in over the hold as its progress. Rows
 * without their own padding pass `bleed` so the highlight reaches past the text. */
export function rowActionsClass(bleed = false) {
  return bleed
    ? "group/row isolate pointer-coarse:data-long-press:select-none pointer-coarse:data-long-press:[-webkit-touch-callout:none] after:pointer-events-none after:absolute after:inset-y-0 after:-inset-x-2 after:-z-10 after:rounded-lg after:transition-colors after:duration-500 data-pressing:after:bg-surface-secondary"
    : "group/row pointer-coarse:data-long-press:select-none pointer-coarse:data-long-press:[-webkit-touch-callout:none] transition-colors duration-500 data-pressing:bg-surface-secondary/60";
}
