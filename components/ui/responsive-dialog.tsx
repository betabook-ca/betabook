"use client";

import { Drawer, Modal } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { clsx } from "clsx";
import { useEffect, useState, type ReactNode } from "react";

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
  // The variant is held still for as long as the dialog is on screen,
  // including its exit animation. Swapping Drawer for Modal unmounts the
  // body, so a phone rotated mid-form would lose everything typed into it,
  // and a swap part-way through the exit would make the dialog vanish
  // instead of sliding away. `EXIT_SETTLE_MS` clears HeroUI's exit before
  // the viewport is followed again.
  const [pinned, setPinned] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (live === undefined) return;
    // The first real reading is adopted straight away, so a dialog that
    // starts open still opens as the right variant.
    if (pinned === undefined) {
      // oxlint-disable-next-line react/set-state-in-effect -- one-time adoption of the resolved viewport
      setPinned(live);
      return;
    }
    if (state.isOpen || pinned === live) return;
    const timer = setTimeout(() => setPinned(live), EXIT_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [live, pinned, state.isOpen]);
  const desktop = pinned ?? live ?? false;

  function handleOpenChange(open: boolean) {
    if (isPending) return;
    state.setOpen(open);
    if (!open) onClose?.();
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

  const fullscreen = presentation === "fullscreen";
  return (
    <Drawer.Backdrop
      isOpen={state.isOpen}
      onOpenChange={handleOpenChange}
      isDismissable={!isPending}
    >
      <Drawer.Content>
        <Drawer.Dialog
          aria-label={title}
          // HeroUI sets the 85vh cap and rounded top corners with a
          // class-plus-attribute selector, so these need `!` to win.
          className={clsx(fullscreen && "h-full! max-h-full! rounded-none!")}
        >
          {/* Only the sheet can be dragged away. */}
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
