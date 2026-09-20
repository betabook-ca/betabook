"use client";

import { Drawer, Modal } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { clsx } from "clsx";
import type { ReactNode } from "react";

import { useIsAtLeast } from "@/hooks/use-breakpoint";

/** Desktop width. Mobile always takes the full screen width, so this only
 * ever describes the centered variant. */
export type DialogSize = "sm" | "md" | "lg";

/** How the dialog arrives on a phone.
 *
 * `sheet` rises from the bottom edge and stops at 85vh — right for anything
 * that fits, because it keeps the page visible above it and sits under the
 * thumb. `fullscreen` takes the whole viewport, for forms tall enough that
 * an on-screen keyboard would otherwise leave a porthole to scroll a dozen
 * fields through. */
export type DialogPresentation = "sheet" | "fullscreen";

const DESKTOP_WIDTH_CLASS: Record<DialogSize, string> = {
  sm: "w-full max-w-md",
  md: "w-full max-w-lg",
  lg: "w-full max-w-2xl",
};

type ResponsiveDialogProps = {
  state: UseOverlayStateReturn;
  /** Names the dialog for assistive tech in every variant. Pass
   * `hideTitle` when the body already carries the same words as a heading. */
  title: string;
  hideTitle?: boolean;
  size?: DialogSize;
  presentation?: DialogPresentation;
  /** Blocks dismissal — backdrop, Escape, close button and the sheet's drag
   * — while a submit is in flight, so a half-written request can't be
   * abandoned by a stray tap. */
  isPending?: boolean;
  /** Runs after the dialog closes, for resetting whatever error or notice
   * the body was showing. */
  onClose?: () => void;
  /** Pinned below the body rather than scrolling with it. On a phone this is
   * where the primary action belongs: at the bottom of a scrolling form it
   * would sit behind the keyboard. */
  footer?: ReactNode;
  children: ReactNode;
};

/** The app's one task dialog: a bottom sheet on phones, a centered modal
 * from `md` up.
 *
 * Reach and the keyboard decide the phone variant — a sheet starts its
 * content in the thumb's half of the screen and resizes against the
 * keyboard, while a centered card puts the primary action mid-screen and its
 * close target in the hardest corner to reach. Neither argument survives a
 * mouse and a wide viewport, where a full-width surface would instead stretch
 * a three-field form across 1000px, so the same dialog centers itself and
 * takes a readable column.
 *
 * Questions rather than tasks — a delete confirmation, a terms gate, a
 * readout — stay centered at every width and use ConfirmDialog or a plain
 * Modal instead. A sheet's chrome dwarfs two lines and two buttons, and its
 * drag affordance advertises a dismissal that a gate refuses. */
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
  // Held still for as long as the dialog is open: crossing the breakpoint
  // swaps Drawer for Modal, which unmounts the body, so a phone rotated
  // mid-form would lose every field the viewer had filled in. Whichever
  // variant the dialog opened as, it stays until it closes.
  const desktop = useIsAtLeast("md", { live: !state.isOpen }) ?? false;

  function handleOpenChange(open: boolean) {
    if (isPending) return;
    state.setOpen(open);
    if (!open) onClose?.();
  }

  const heading = <span className={clsx(hideTitle && "sr-only")}>{title}</span>;
  // Mounted only while open, so reopening always starts from a pristine form
  // instead of whatever the last visit left behind.
  const body = state.isOpen ? children : null;

  if (desktop) {
    return (
      <Modal.Backdrop isOpen={state.isOpen} onOpenChange={handleOpenChange}>
        <Modal.Container placement="center" scroll="inside">
          <Modal.Dialog aria-label={title} className={DESKTOP_WIDTH_CLASS[size]}>
            <Modal.Header>
              <Modal.Heading>{heading}</Modal.Heading>
              <Modal.CloseTrigger isDisabled={isPending} />
            </Modal.Header>
            <Modal.Body>{body}</Modal.Body>
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
          // The placement rule that caps a sheet at 85vh and rounds its top
          // corners is a class-plus-attribute selector, so the fullscreen
          // overrides have to be marked important to outrank it.
          className={clsx(fullscreen && "h-full! max-h-full! rounded-none!")}
        >
          {/* Only the sheet can be dragged away, so only the sheet claims to
           * be draggable. */}
          {!fullscreen && <Drawer.Handle />}
          <Drawer.Header>
            <Drawer.Heading>{heading}</Drawer.Heading>
            <Drawer.CloseTrigger isDisabled={isPending} />
          </Drawer.Header>
          <Drawer.Body>{body}</Drawer.Body>
          {footer && <Drawer.Footer>{footer}</Drawer.Footer>}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
