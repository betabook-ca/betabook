"use client";

import { Drawer } from "@heroui/react";

import { AppMenuLinks } from "@/components/app-menu-links";
import { useFriendRequests } from "@/components/friend-requests-provider";
import { openMobileAppHelper } from "@/components/mobile-app-helper";
import { Skeleton } from "@/components/ui/skeleton";
import { useMounted } from "@/hooks/use-mounted";
import { authClient } from "@/lib/auth-client";
import { isMobileDevice, isStandaloneDisplay } from "@/lib/mobile-detection";

/** Split from its trigger so `Drawer` and the react-aria overlay code stay out
 * of the bundle every route loads. Open state stays with the trigger, which has
 * to work before this module arrives. */
export function AppMenuDrawer({
  isOpen,
  onOpenChange,
  onClose,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onClose: () => void;
}) {
  const mounted = useMounted();
  const { data: session, isPending } = authClient.useSession();
  const requests = useFriendRequests();

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
              {!mounted || isPending ? (
                <div aria-hidden className="flex flex-col gap-2">
                  {["profile", "feed", "friends", "add"].map((key) => (
                    <Skeleton key={key} rounded="rounded-lg" className="h-9 w-full" />
                  ))}
                </div>
              ) : (
                <AppMenuLinks
                  account={
                    session && {
                      id: session.user.id,
                      name: session.user.name,
                      image: session.user.image,
                      isAdmin: session.user.role === "admin",
                    }
                  }
                  requestCount={
                    session && requests.userId === session.user.id ? (requests.count ?? 0) : 0
                  }
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
