"use client";

import { Button } from "@heroui/react";
import { Menu, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog, Popover } from "react-aria-components";

import { SidebarFrame } from "@/components/app-sidebar";
import { AppTabLinks } from "@/components/app-tab-bar";
import { Brand } from "@/components/brand";
import { SearchTriggerControl } from "@/components/command-palette";
import { NavLink } from "@/components/nav-link";
import { PrimaryNavigationLink } from "@/components/primary-navigation-link";
import type { ProductTourPageProps } from "@/components/product-tours/types";
import { AppLink } from "@/components/ui/app-link";
import { useTyping } from "@/hooks/use-mobile-tabs-visible";
import { AREA_LABELS, type PrimaryArea, type PrimaryDestination } from "@/lib/app-navigation";

const ACCOUNT = { name: "Alex Morgan", image: null };

/** Preview navigation opens lessons, never sample account or catalog URLs. */
export function TourNavigationFrame({
  current,
  href,
  requestCount,
  logAction,
  findClimbsCurrent = false,
  children,
}: {
  current?: PrimaryArea;
  href: ProductTourPageProps["href"];
  requestCount: number;
  logAction?: ReactNode;
  /** The Find climbs lesson is open; the row is highlighted as in the app. */
  findClimbsCurrent?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const typing = useTyping();
  const [menuOpen, setMenuOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen || !frame.current) return;
    const closeWhenHidden = () => {
      if (trigger.current && getComputedStyle(trigger.current).display === "none")
        setMenuOpen(false);
    };
    const resize = new ResizeObserver(closeWhenHidden);
    resize.observe(frame.current);
    return () => resize.disconnect();
  }, [menuOpen]);
  // All destinations remain available even when entered through the shorter update tour.
  const primary: PrimaryDestination[] = [
    { id: "logbook", label: AREA_LABELS.logbook, href: href("journal", "full") },
    { id: "progress", label: AREA_LABELS.progress, href: href("projects", "full") },
    { id: "community", label: AREA_LABELS.community, href: href("feed", "full") },
  ];
  const account: PrimaryDestination = {
    id: "account",
    label: AREA_LABELS.account,
    href: href("account", "full"),
  };
  function link(item: PrimaryDestination, collapsed: boolean, appearance: "sidebar" | "menu") {
    return (
      <PrimaryNavigationLink
        key={item.id}
        item={item}
        account={ACCOUNT}
        current={current === item.id}
        appearance={appearance}
        collapsed={collapsed}
        requestCount={requestCount}
        onNavigate={() => setMenuOpen(false)}
      />
    );
  }
  /** The app's Find climbs row, opening the browsing lesson. */
  function findClimbs(collapsed: boolean, appearance: "sidebar" | "menu") {
    return (
      <NavLink
        href={href("find-projects", "full")}
        appearance={appearance}
        isCurrent={findClimbsCurrent}
        onClick={() => setMenuOpen(false)}
        className={
          appearance === "sidebar" ? "justify-start overflow-hidden" : "min-h-12 justify-start"
        }
      >
        <span className="flex size-6 shrink-0 items-center justify-center">
          <Search aria-hidden className="size-5" />
        </span>
        <span className={collapsed ? "min-w-0 truncate opacity-0" : "min-w-0 truncate"}>
          Find climbs
        </span>
      </NavLink>
    );
  }
  return (
    <div
      ref={frame}
      className="@container/navigation h-full min-h-0 overflow-hidden rounded-panel border border-separator bg-background"
    >
      <SidebarFrame
        placement="contained"
        label="Example sidebar"
        navigationLabel="Example desktop navigation"
        renderNavigation={(collapsed) => (
          <div className="flex min-h-full flex-col gap-4">
            <div className="flex flex-col gap-1">
              {primary.map((item) => link(item, collapsed, "sidebar"))}
              {findClimbs(collapsed, "sidebar")}
            </div>
            <div className="mt-auto">{link(account, collapsed, "sidebar")}</div>
          </div>
        )}
      >
        <header className="grid h-14 shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 px-4 @lg/navigation:grid-cols-[auto_minmax(0,1fr)_auto]">
          <Button
            isIconOnly
            variant="ghost"
            className="size-11 @lg/navigation:hidden"
            aria-label="Open example menu"
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            ref={trigger}
            onPress={() => setMenuOpen(true)}
          >
            <Menu aria-hidden className="size-5" />
          </Button>
          <AppLink
            href={href("journal", "full")}
            aria-label="Example Logbook home"
            className="hidden h-10 items-center gap-2 @lg/navigation:flex"
          >
            <Brand decorative compact className="size-6" />
            <Brand decorative variant="wordmark" className="hidden w-24 @2xl/navigation:block" />
          </AppLink>
          <SearchTriggerControl
            responsiveTo="container"
            showShortcut={false}
            onOpenSearch={() => router.push(href("find-climbers", "full"))}
          />
          <div className="min-w-11">{logAction}</div>
        </header>
        <div
          data-tour-scroll
          className="min-h-0 flex-1 overflow-auto overscroll-contain p-4 @lg/navigation:pt-2"
        >
          {children}
        </div>
        {!typing && (
          <nav
            aria-label="Example mobile navigation"
            className="shrink-0 border-t border-separator bg-background @lg/navigation:hidden"
          >
            <AppTabLinks
              account={ACCOUNT}
              current={current}
              destinations={primary}
              requestCount={requestCount}
            />
          </nav>
        )}
      </SidebarFrame>
      <Popover
        triggerRef={trigger}
        isOpen={menuOpen}
        onOpenChange={setMenuOpen}
        placement="bottom start"
        offset={8}
        className="popover w-64 max-w-[calc(100vw-2rem)] p-2"
      >
        <Dialog aria-label="Example menu" className="outline-none">
          <nav aria-label="Tour destinations" className="flex flex-col gap-1">
            {typing && primary.map((item) => link(item, false, "menu"))}
            {findClimbs(false, "menu")}
            {link(account, false, "menu")}
          </nav>
        </Dialog>
      </Popover>
    </div>
  );
}
