"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";

import { PrimaryNavigationLink } from "@/components/app-shell/primary-navigation-link";
import { useFriendRequestCount } from "@/components/friends/friend-requests-provider";
import { useClientSession } from "@/hooks/use-client-session";
import { useMobileTabsVisible } from "@/hooks/use-mobile-tabs-visible";
import {
  primaryAreaForPath,
  primaryDestinations,
  type PrimaryArea,
  type PrimaryDestination,
} from "@/lib/app-navigation";
import { usePathname } from "@/spa/lib/navigation";

type TabAccount = { id: string; name: string; image?: string | null };

export function AppTabBar() {
  const session = useClientSession();
  const requestCount = useFriendRequestCount();
  const tabsVisible = useMobileTabsVisible();
  if (!session || !tabsVisible) return null;

  return <FloatingAppTabBar account={session.user} requestCount={requestCount} />;
}

/** Shared live frame for the app and scroll-behavior gallery. */
export function FloatingAppTabBar(props: AppTabsProps) {
  const pathname = usePathname();
  const barRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    // Measure the resting box only. Scaling it never triggers this observer.
    const observer = new ResizeObserver(([entry]) => {
      const { inlineSize, blockSize } = entry.borderBoxSize[0];
      if (!inlineSize || !blockSize) return;
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      const compactWidth = Math.min(18 * rem, inlineSize - rem);
      bar.style.setProperty("--tab-compact-x", String(compactWidth / inlineSize));
      bar.style.setProperty("--tab-compact-y", String(1 - (0.75 * rem) / blockSize));
    });
    observer.observe(bar, { box: "border-box" });
    return () => observer.disconnect();
  }, []);
  const [selected, setSelected] = useState<PrimaryArea>();
  const [scrollState, setScrollState] = useState({ pathname, compact: false });
  if (scrollState.pathname !== pathname) {
    setScrollState({ pathname, compact: false });
    setSelected(undefined);
  }
  const compact = !selected && scrollState.pathname === pathname && scrollState.compact;

  function selectTab(event: MouseEvent<HTMLElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    if (!link || link.target || link.pathname === pathname) return;
    setSelected(primaryAreaForPath(link.pathname, props.account.id));
  }

  const scrollPath = useRef(pathname);
  useLayoutEffect(() => {
    // A route can reset or clamp the scroll position several times as its content arrives.
    let userScrolling = scrollPath.current === pathname;
    scrollPath.current = pathname;
    const beginScroll = () => {
      userScrolling = true;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key))
        beginScroll();
    };
    let previous = Math.max(0, window.scrollY);
    let travel = 0;
    let minimized = false;
    const onScroll = () => {
      const y = Math.max(0, window.scrollY);
      const delta = y - previous;
      previous = y;
      if (!userScrolling || delta === 0) return;
      travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;
      const next = y < 72 || travel <= -12 ? false : travel >= 24 ? true : minimized;
      if (next !== minimized) {
        minimized = next;
        setScrollState({ pathname, compact: next });
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    if (!userScrolling) {
      window.addEventListener("touchmove", beginScroll, { passive: true, once: true });
      window.addEventListener("wheel", beginScroll, { passive: true, once: true });
      window.addEventListener("keydown", onKeyDown);
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchmove", beginScroll);
      window.removeEventListener("wheel", beginScroll);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pathname]);

  return (
    <>
      <div aria-hidden className="h-[var(--app-tab-bar-height)] md:hidden" />
      <nav
        aria-label="Primary"
        data-app-tab-bar
        ref={barRef}
        onClickCapture={selectTab}
        data-destination={selected}
        data-compact={compact}
        className="app-tab-bar-surface app-tab-bar-floating fixed inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 mx-auto md:hidden"
      >
        <AppTabs {...props} />
      </nav>
    </>
  );
}

type AppTabsProps = {
  account: TabAccount;
  requestCount?: number;
  notificationCounts?: Partial<Record<PrimaryArea, number>>;
};

export function AppTabs({ account, requestCount = 0, notificationCounts }: AppTabsProps) {
  const current = primaryAreaForPath(usePathname(), account.id);
  return (
    <AppTabLinks
      account={account}
      current={current}
      destinations={primaryDestinations(account.id)}
      requestCount={requestCount}
      notificationCounts={notificationCounts}
    />
  );
}

export function AppTabLinks({
  account,
  current,
  destinations,
  requestCount = 0,
  notificationCounts,
}: {
  account: { name: string; image?: string | null };
  current?: PrimaryArea;
  destinations: readonly PrimaryDestination[];
  requestCount?: number;
  notificationCounts?: Partial<Record<PrimaryArea, number>>;
}) {
  return (
    <ul className="app-tab-links mx-auto grid h-14 max-w-md grid-cols-3">
      {destinations.map((item) => (
        <li key={item.id}>
          <PrimaryNavigationLink
            item={item}
            account={account}
            current={current === item.id}
            appearance="tab"
            requestCount={requestCount}
            notificationCount={notificationCounts?.[item.id]}
          />
        </li>
      ))}
    </ul>
  );
}
