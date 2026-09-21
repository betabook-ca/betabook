"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { BrandHomeLink } from "@/components/brand";
import { useFriendRequestCount } from "@/components/friend-requests-provider";
import { DeferredLoadError } from "@/components/ui/deferred-load-error";
import { BREAKPOINT_QUERY } from "@/hooks/use-breakpoint";
import { useClientSession } from "@/hooks/use-client-session";
import { useDeferredComponent } from "@/hooks/use-deferred-component";
import { useMobileTabsVisible } from "@/hooks/use-mobile-tabs-visible";

/** Module-level so its identity is stable across renders — the preload hook
 * keys its effect on the loader. */
const loadMenu = () => import("@/components/app-menu-popover").then((m) => m.AppMenuPopover);

/** The mobile menu opens under its trigger; desktop branding links Home. */
export function HeaderNavigation() {
  const state = useOverlayState();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { close, open, setOpen } = state;
  const pathname = usePathname();
  const session = useClientSession();
  const requestCount = useFriendRequestCount();
  const tabsVisible = useMobileTabsVisible();
  const { Component: AppMenuPopover, load, failed } = useDeferredComponent(loadMenu);

  const openMenu = useCallback(() => {
    load();
    open();
  }, [load, open]);

  // Menu links close it on press, including a link to the current page. The
  // root layout persists, so navigations started elsewhere need this too.
  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    const desktop = window.matchMedia(BREAKPOINT_QUERY.md);
    const closeOnDesktop = () => {
      if (desktop.matches) close();
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [close]);

  return (
    <>
      <Button
        isIconOnly
        variant="ghost"
        className="size-11 md:hidden"
        ref={triggerRef}
        aria-label="Open menu"
        aria-expanded={state.isOpen}
        aria-haspopup="dialog"
        onPress={openMenu}
      >
        <Menu aria-hidden className="size-5" />
      </Button>
      <div className="hidden md:block">
        <BrandHomeLink />
      </div>
      {state.isOpen && failed && (
        <DeferredLoadError feature="the menu" onRetry={load} onDismiss={close} />
      )}
      {AppMenuPopover && (
        <AppMenuPopover
          triggerRef={triggerRef}
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
          showPrimary={!tabsVisible}
        />
      )}
    </>
  );
}
