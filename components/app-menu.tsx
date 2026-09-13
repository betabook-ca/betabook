"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Menu as MenuIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect } from "react";

import { FriendRequestDot, withRequestCount } from "@/components/friend-request-badge";
import { useFriendRequestCount } from "@/components/friend-requests-provider";
import { useClientSession } from "@/hooks/use-client-session";
import { useDeferredComponent } from "@/hooks/use-deferred-component";

/** Module-level so its identity is stable across renders — the preload hook
 * keys its effect on the loader. */
const loadDrawer = () => import("@/components/app-menu-drawer").then((m) => m.AppMenuDrawer);

export function AppMenuButton() {
  const state = useOverlayState();
  const { close, open, setOpen } = state;
  const pathname = usePathname();
  const session = useClientSession();
  const requestCount = useFriendRequestCount();
  const { Component: AppMenuDrawer, load } = useDeferredComponent(loadDrawer);

  const openMenu = useCallback(() => {
    load();
    open();
  }, [load, open]);

  // Menu links close it on press, including a link to the current page. The
  // root layout persists, so navigations started elsewhere need this too.
  useEffect(() => {
    close();
  }, [pathname, close]);

  return (
    <>
      <Button
        isIconOnly
        variant="ghost"
        className="relative"
        aria-label={withRequestCount("Open menu", requestCount)}
        onPress={openMenu}
      >
        <MenuIcon className="size-5" />
        {requestCount > 0 && <FriendRequestDot className="absolute top-1.5 right-1.5" />}
      </Button>
      {AppMenuDrawer && (
        <AppMenuDrawer
          isOpen={state.isOpen}
          onOpenChange={setOpen}
          onClose={close}
          account={
            session && {
              id: session.user.id,
              name: session.user.name,
              image: session.user.image,
              isAdmin: session.user.role === "admin",
            }
          }
          requestCount={requestCount}
        />
      )}
    </>
  );
}
