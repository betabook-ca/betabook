"use client";

import { Drawer } from "@heroui/react";

import { AppMenuLinks, type MenuAccount } from "@/components/app-menu-links";
import { openMobileAppHelper } from "@/components/mobile-app-helper";
import { Skeleton } from "@/components/ui/skeleton";
import { isMobileDevice, isStandaloneDisplay } from "@/lib/mobile-detection";

/** Split from its trigger so `Drawer` and the react-aria overlay code stay out
 * of the bundle every route loads. Open state stays with the trigger, which has
 * to work before this module arrives. */
export function AppMenuDrawer({
  isOpen,
  onOpenChange,
  onClose,
  account,
  requestCount,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onClose: () => void;
  /** Undefined until the session is known. */
  account: MenuAccount | null | undefined;
  requestCount: number;
}) {
  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Content placement="left">
        <Drawer.Dialog>
          <Drawer.Header>
            <Drawer.Heading>Menu</Drawer.Heading>
            <Drawer.CloseTrigger />
          </Drawer.Header>
          <Drawer.Body>
            <nav aria-label="Menu">
              {account === undefined ? (
                <div aria-hidden className="flex flex-col gap-2">
                  {["profile", "feed", "friends", "add"].map((key) => (
                    <Skeleton key={key} rounded="rounded-lg" className="h-9 w-full" />
                  ))}
                </div>
              ) : (
                <AppMenuLinks
                  account={account}
                  requestCount={requestCount}
                  canInstall={isMobileDevice() && !isStandaloneDisplay()}
                  onNavigate={onClose}
                  onInstall={() => {
                    onClose();
                    openMobileAppHelper();
                  }}
                />
              )}
            </nav>
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
