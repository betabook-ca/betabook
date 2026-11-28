"use client";

import type { RefObject } from "react";
import { Dialog, Popover } from "react-aria-components";

import { AppMenuLinks, type MenuAccount } from "@/components/app-shell/app-menu-links";
import { openMobileAppHelper } from "@/components/app-shell/mobile-app-helper";
import { MENU_PANEL_CLASS } from "@/components/app-shell/nav-link";
import { Skeleton } from "@/components/ui/skeleton";
import { isMobileDevice, isStandaloneDisplay } from "@/lib/mobile-detection";

/** Lazy-loaded secondary navigation, anchored to the explicit mobile menu button. */
export function AppMenuPopover({
  isOpen,
  onOpenChange,
  onClose,
  account,
  requestCount,
  showPrimary = true,
  triggerRef,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onClose: () => void;
  account: MenuAccount | null | undefined;
  requestCount: number;
  showPrimary?: boolean;
  triggerRef: RefObject<Element | null>;
}) {
  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      triggerRef={triggerRef}
      placement="bottom start"
      offset={8}
      className={`${MENU_PANEL_CLASS} max-h-[min(28rem,var(--available-height))] overflow-y-auto motion-reduce:animate-none`}
    >
      <Dialog aria-label="Menu" className="outline-none">
        <nav aria-label="Menu">
          {account === undefined ? (
            <div role="status" aria-label="Loading navigation" className="flex flex-col gap-1">
              {["add", "tutorials"].map((key) => (
                <Skeleton key={key} rounded="rounded-lg" className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <AppMenuLinks
              account={account}
              requestCount={requestCount}
              showPrimary={showPrimary}
              canInstall={isMobileDevice() && !isStandaloneDisplay()}
              onNavigate={onClose}
              onInstall={() => {
                onClose();
                openMobileAppHelper();
              }}
            />
          )}
        </nav>
      </Dialog>
    </Popover>
  );
}
