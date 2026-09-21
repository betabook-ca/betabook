"use client";

import { Drawer, Modal } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { clsx } from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useIsAtLeast } from "@/hooks/use-breakpoint";

/** Desktop width. Mobile is always full width, so this only affects the
 * centered variant. */
export type DialogSize = "sm" | "md" | "lg";

/** How it arrives on a phone. `sheet` rises from the bottom and stops at
 * 85vh. `fullscreen` takes the whole viewport — use it for forms long enough
 * that 85vh minus a keyboard leaves too little to work in. */
export type DialogPresentation = "sheet" | "fullscreen";

/** HeroUI's drawer exit runs 200ms; this leaves room either side of it. */
const EXIT_SETTLE_MS = 300;

const DESKTOP_WIDTH_CLASS: Record<DialogSize, string> = {
  sm: "w-full max-w-md",
  md: "w-full max-w-lg",
  lg: "w-full max-w-2xl",
};

type ResponsiveDialogProps = {
  state: UseOverlayStateReturn;
  /** Names the dialog for assistive tech. Set `hideTitle` when the body
   * already shows the same words as a heading. */
  title: string;
  hideTitle?: boolean;
  size?: DialogSize;
  presentation?: DialogPresentation;
  /** Blocks every way out — backdrop, Escape, close button, drag — while a
   * submit is in flight. */
  isPending?: boolean;
  /** Runs after close, for clearing whatever error or notice the body was
   * showing. */
  onClose?: () => void;
  /** Pinned below the body instead of scrolling with it. Put the primary
   * action here on long forms, or the keyboard covers it. */
  footer?: ReactNode;
  children: ReactNode;
};

/** The dialog for tasks: a bottom sheet on phones, a centered modal from
 * `md` up.
 *
 * On a phone a sheet keeps the primary action near the thumb and resizes
 * against the keyboard. Neither helps with a mouse and a wide screen, where
 * full width would stretch a short form across 1000px, so the same dialog
 * centers itself in a readable column.
 *
 * Confirmations, gates and readouts aren't tasks. Those use ConfirmDialog or
 * a plain Modal and stay centered at every width. */
export function ResponsiveDialog({
  state,
  title,
  hideTitle = false,
  size = "md",
  presentation = "sheet",
  isPending = false,
  onClose,
  footer,
  children,
}: ResponsiveDialogProps) {
  const live = useIsAtLeast("md");
  const [pinned, setPinned] = useState<boolean | undefined>(undefined);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Swapping Drawer for Modal unmounts the body, so a phone rotated mid-form
  // would lose everything typed into it, and a swap part-way through the exit
  // would make the dialog vanish instead of sliding away. The viewport is
  // read once when it opens and held for that dialog's lifetime, so crossing
  // the breakpoint while it is closed still gets picked up on the next open.
  useEffect(() => {
    if (live !== undefined && pinned === undefined) {
      // oxlint-disable-next-line react/set-state-in-effect -- adopts the first resolved viewport
      setPinned(live);
    }
  }, [live, pinned]);

  const openedRef = useRef(false);
  // Held outside the effect's cleanup on purpose: an unrelated re-render
  // must not cancel a reset that is already scheduled.
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (state.isOpen === openedRef.current) return;
    openedRef.current = state.isOpen;

    if (state.isOpen) {
      // Reopened before the last exit settled — run the pending reset now,
      // or the fresh dialog would show the previous one's notice and
      // half-filled fields.
      if (resetTimerRef.current !== undefined) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = undefined;
        onCloseRef.current?.();
      }
      // oxlint-disable-next-line react/set-state-in-effect -- re-reads the viewport at the moment of opening
      if (live !== undefined) setPinned(live);
      return;
    }

    // Resetting while the dialog is still sliding away would swap the body
    // out in full view — the same artifact as blanking it.
    resetTimerRef.current = setTimeout(() => {
      resetTimerRef.current = undefined;
      onCloseRef.current?.();
    }, EXIT_SETTLE_MS);
  }, [state.isOpen, live]);

  useEffect(
    () => () => {
      if (resetTimerRef.current !== undefined) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const desktop = pinned ?? live ?? false;
  const fullscreen = presentation === "fullscreen";

  // `onClose` isn't called here — the effect above runs it once the exit has
  // finished, and it fires for a programmatic `state.close()` too.
  function handleOpenChange(open: boolean) {
    if (!isPending) state.setOpen(open);
  }

  const heading = <span className={clsx(hideTitle && "sr-only")}>{title}</span>;
  // `children` is rendered as-is rather than gated on `isOpen`: react-aria
  // keeps the overlay mounted for its exit animation, so blanking the body
  // there would empty the dialog for 200ms while it slid away. Closing
  // unmounts the whole subtree anyway, so a reopened form still starts
  // clean.

  if (desktop) {
    return (
      <Modal.Backdrop isOpen={state.isOpen} onOpenChange={handleOpenChange}>
        <Modal.Container placement="center" scroll="inside">
          <Modal.Dialog aria-label={title} className={DESKTOP_WIDTH_CLASS[size]}>
            <Modal.Header>
              <Modal.Heading>{heading}</Modal.Heading>
              <Modal.CloseTrigger isDisabled={isPending} />
            </Modal.Header>
            <Modal.Body>{children}</Modal.Body>
            {footer && <Modal.Footer>{footer}</Modal.Footer>}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    );
  }

  return (
    <Drawer.Backdrop
      isOpen={state.isOpen}
      onOpenChange={handleOpenChange}
      // HeroUI hangs drag-to-dismiss off the dialog itself and gates it on
      // this flag alone — the header is a drag surface whether or not a
      // handle is rendered. A fullscreen form must not be swipeable away
      // with a half-filled form behind the gesture, and it has no visible
      // backdrop to lose. Escape and the close button are unaffected.
      isDismissable={!isPending && !fullscreen}
    >
      <Drawer.Content>
        <Drawer.Dialog
          aria-label={title}
          // HeroUI sets the 85vh cap and rounded top corners with a
          // class-plus-attribute selector, so these need `!` to win.
          className={clsx(fullscreen && "h-full! max-h-full! rounded-none!")}
        >
          {/* The handle advertises the drag; `isDismissable` above is what
           * actually allows it. */}
          {!fullscreen && <Drawer.Handle />}
          <Drawer.Header>
            <Drawer.Heading>{heading}</Drawer.Heading>
            <Drawer.CloseTrigger isDisabled={isPending} />
          </Drawer.Header>
          <Drawer.Body>{children}</Drawer.Body>
          {footer && <Drawer.Footer>{footer}</Drawer.Footer>}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
