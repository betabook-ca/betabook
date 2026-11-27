"use client";

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

  return (
    <>
      <div aria-hidden className="h-[var(--app-tab-bar-height)] md:hidden" />
      <nav
        aria-label="Primary"
        data-app-tab-bar
        className="app-tab-bar-surface fixed inset-x-4 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-md md:hidden"
      >
        <AppTabs account={session.user} requestCount={requestCount} />
      </nav>
    </>
  );
}

export function AppTabs({
  account,
  requestCount = 0,
}: {
  account: TabAccount;
  requestCount?: number;
}) {
  const current = primaryAreaForPath(usePathname(), account.id);
  return (
    <AppTabLinks
      account={account}
      current={current}
      destinations={primaryDestinations(account.id)}
      requestCount={requestCount}
    />
  );
}

export function AppTabLinks({
  account,
  current,
  destinations,
  requestCount = 0,
}: {
  account: { name: string; image?: string | null };
  current?: PrimaryArea;
  destinations: readonly PrimaryDestination[];
  requestCount?: number;
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
          />
        </li>
      ))}
    </ul>
  );
}
