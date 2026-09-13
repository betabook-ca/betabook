"use client";

import { Button, Menu, Tooltip } from "@heroui/react";
import { MoreHorizontal } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { MenuTrigger, Popover } from "react-aria-components";

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

/** The "..." actions menu used by area/climb/send actions menus — composed
 * from react-aria-components' raw MenuTrigger/Popover rather than HeroUI's
 * styled Popover: HeroUI doesn't export a combined trigger for Menu, and its
 * <Popover.Content> only picks up its background/shadow styling via a
 * <Popover.Root> (DialogTrigger) ancestor — which would conflict with
 * MenuTrigger's own trigger/overlay wiring. `.popover` below is the same
 * global class that slot resolves to, applied directly. */
export function ActionsMenu({
  ariaLabel,
  onAction,
  children,
  triggerClassName,
  icon,
  tooltip,
}: ActionsMenuProps) {
  const trigger = (
    <Button
      isIconOnly
      variant="ghost"
      size="sm"
      aria-label={ariaLabel}
      className={triggerClassName}
    >
      {icon ?? <MoreHorizontal className="size-4" />}
    </Button>
  );
  return (
    <MenuTrigger>
      {tooltip ? (
        <Tooltip.Root delay={200}>
          {trigger}
          <Tooltip.Content>{tooltip}</Tooltip.Content>
        </Tooltip.Root>
      ) : (
        trigger
      )}
      <Popover className="popover" placement="bottom end">
        <Menu.Root onAction={onAction}>{children}</Menu.Root>
      </Popover>
    </MenuTrigger>
  );
}
