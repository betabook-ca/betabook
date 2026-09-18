"use client";

import type { RefObject } from "react";
import { Dialog, Popover } from "react-aria-components";

import { AppMenuLinks } from "@/components/app-menu-links";
import { openMobileAppHelper } from "@/components/mobile-app-helper";
import { Skeleton } from "@/components/ui/skeleton";
import type { MenuAccount } from "@/lib/app-navigation";
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
      className="popover max-h-[min(28rem,var(--available-height))] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto p-2 motion-reduce:animate-none"
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
