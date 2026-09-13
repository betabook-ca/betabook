"use client";

import { Button, Menu } from "@heroui/react";
import { MoreHorizontal } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { MenuTrigger, Popover } from "react-aria-components";

type ActionsMenuProps = {
  ariaLabel: string;
  onAction: ComponentProps<typeof Menu.Root>["onAction"];
  children: ReactNode;
  triggerClassName?: string;
};

/** The "..." actions menu used by area/climb/send actions menus — composed
 * from react-aria-components' raw MenuTrigger/Popover rather than HeroUI's
 * styled Popover: HeroUI doesn't export a combined trigger for Menu, and its
 * <Popover.Content> only picks up its background/shadow styling via a
 * <Popover.Root> (DialogTrigger) ancestor — which would conflict with
 * MenuTrigger's own trigger/overlay wiring. `.popover` below is the same
 * global class that slot resolves to, applied directly. */
export function ActionsMenu({ ariaLabel, onAction, children, triggerClassName }: ActionsMenuProps) {
  return (
    <MenuTrigger>
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label={ariaLabel}
        className={triggerClassName}
      >
        <MoreHorizontal className="size-4" />
      </Button>
      <Popover className="popover" placement="bottom end">
        <Menu.Root onAction={onAction}>{children}</Menu.Root>
      </Popover>
    </MenuTrigger>
  );
}
