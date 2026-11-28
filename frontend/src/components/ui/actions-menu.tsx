"use client";

import { Button, Dropdown, type Menu, Tooltip } from "@heroui/react";
import { clsx } from "clsx";
import { MoreHorizontal, Pencil } from "lucide-react";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";

import { useRowActions } from "@/components/ui/row-actions";

type ActionsMenuProps = {
  ariaLabel: string;
  onAction: ComponentProps<typeof Menu.Root>["onAction"];
  children: ReactNode;
  triggerClassName?: string;
  /** Replaces "...", e.g. with the status the menu acts on. */
  icon?: ReactNode;
  /** Names a replacement icon for pointer users. */
  tooltip?: string;
};

/** The "..." actions menu used by area/climb/send actions menus, on HeroUI's
 * Dropdown (its MenuTrigger, popover and menu).
 *
 * In a row's actions slot the button is a pencil that pointer screens show
 * only while the row is hovered or focused, so a list isn't a column of
 * dots. Touch screens have no hover, so there it stays visible at a full tap
 * size, and a long press anywhere on the row opens the menu at the finger. */
export function ActionsMenu({
  ariaLabel,
  onAction,
  children,
  triggerClassName,
  icon,
  tooltip,
}: ActionsMenuProps) {
  const row = useRowActions();
  const [isOpen, setOpen] = useState(false);
  // Kept after closing so the exit animation leaves from where it opened.
  const [openedByRow, setOpenedByRow] = useState(false);
  useEffect(
    () =>
      row?.register(() => {
        setOpenedByRow(true);
        setOpen(true);
      }),
    [row],
  );

  const trigger = (
    <Button
      isIconOnly
      variant="ghost"
      size="sm"
      aria-label={ariaLabel}
      className={clsx(
        triggerClassName,
        row && [
          "pointer-coarse:size-11",
          // Opacity, not display, so revealing it doesn't reflow the row.
          "pointer-fine:opacity-0 pointer-fine:transition-opacity",
          "pointer-fine:group-focus-within/row:opacity-100 pointer-fine:group-hover/row:opacity-100",
          "pointer-fine:aria-expanded:opacity-100",
        ],
      )}
    >
      {icon ?? (row ? <Pencil className="size-4" /> : <MoreHorizontal className="size-4" />)}
    </Button>
  );
  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (open) setOpenedByRow(false);
        setOpen(open);
      }}
    >
      {tooltip ? (
        <Tooltip.Root delay={200}>
          {trigger}
          <Tooltip.Content>{tooltip}</Tooltip.Content>
        </Tooltip.Root>
      ) : (
        trigger
      )}
      {/* Sized to its content, not to the room left of wherever it first
       * lands: an absolutely positioned box shrinks to fit the space to its
       * right, so near the screen's right edge a long item wrapped, the
       * positioner moved the menu left, it widened, and the cycle repeated
       * (a ResizeObserver loop). Capped so a very long item still wraps. */}
      <Dropdown.Popover
        className="w-max max-w-[calc(100vw-2rem)] motion-reduce:animate-none"
        placement={openedByRow ? "bottom" : "bottom end"}
        triggerRef={openedByRow ? row?.anchorRef : undefined}
      >
        <Dropdown.Menu onAction={onAction}>{children}</Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
