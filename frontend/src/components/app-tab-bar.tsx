"use client";

import { useEffect, useState } from "react";

import { useFriendRequestCount } from "@/components/friend-requests-provider";
import { PrimaryNavigationLink } from "@/components/primary-navigation-link";
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
  const [scrollState, setScrollState] = useState({ pathname, compact: false });
  if (scrollState.pathname !== pathname) {
    setScrollState({ pathname, compact: false });
  }
  const compact = scrollState.pathname === pathname && scrollState.compact;
  useEffect(() => {
    let previous = Math.max(0, window.scrollY);
    let travel = 0;
    let minimized = false;
    const onScroll = () => {
      const y = Math.max(0, window.scrollY);
      const delta = y - previous;
      previous = y;
      if (delta === 0) return;
      travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;
      const next = y < 72 || travel <= -12 ? false : travel >= 24 ? true : minimized;
      if (next !== minimized) {
        minimized = next;
        setScrollState({ pathname, compact: next });
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  return (
    <>
      <div aria-hidden className="h-[var(--app-tab-bar-height)] md:hidden" />
      <nav
        aria-label="Primary"
        data-app-tab-bar
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
