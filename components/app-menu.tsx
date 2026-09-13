"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Menu as MenuIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect } from "react";

import { FriendRequestDot, withRequestCount } from "@/components/friend-request-badge";
import { useFriendRequests } from "@/components/friend-requests-provider";
import { useDeferredComponent } from "@/hooks/use-deferred-component";
import { useMounted } from "@/hooks/use-mounted";
import { authClient } from "@/lib/auth-client";

/** Module-level so its identity is stable across renders — the preload hook
 * keys its effect on the loader. */
const loadDrawer = () => import("@/components/app-menu-drawer").then((m) => m.AppMenuDrawer);

export function AppMenuButton() {
  const state = useOverlayState();
  const { close, open, setOpen } = state;
  const pathname = usePathname();
  const mounted = useMounted();
  const { data: session, isPending } = authClient.useSession();
  const requests = useFriendRequests();
  const { Component: AppMenuDrawer, load } = useDeferredComponent(loadDrawer);
  const requestCount =
    mounted && !isPending && session && requests.userId === session.user.id
      ? (requests.count ?? 0)
      : 0;

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
        <AppMenuDrawer isOpen={state.isOpen} onOpenChange={setOpen} onClose={close} />
      )}
    </>
  );
}
