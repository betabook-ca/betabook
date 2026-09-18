"use client";

import { usePathname } from "next/navigation";

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

type TabAccount = { id: string; name: string; image?: string | null };

export function AppTabBar() {
  const session = useClientSession();
  const requestCount = useFriendRequestCount();
  const tabsVisible = useMobileTabsVisible();
  if (!session || !tabsVisible) return null;

  return (
    <>
      <div aria-hidden className="h-[calc(3.5rem+env(safe-area-inset-bottom))] md:hidden" />
      <nav
        aria-label="Primary"
        data-app-tab-bar
        className="fixed inset-x-0 bottom-0 z-40 border-t border-separator bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
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
    <ul className="mx-auto grid h-14 max-w-md grid-cols-3">
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
