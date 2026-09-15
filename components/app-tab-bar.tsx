"use client";

import { clsx } from "clsx";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { FriendRequestBadge, withRequestCount } from "@/components/friend-request-badge";
import { useFriendRequestCount } from "@/components/friend-requests-provider";
import { NavLink } from "@/components/nav-link";
import { PrimaryNavigationIcon } from "@/components/primary-navigation-icon";
import { useClientSession } from "@/hooks/use-client-session";
import { useMobileTabsVisible } from "@/hooks/use-mobile-tabs-visible";
import { primaryAreaForPath, primaryDestinations } from "@/lib/app-navigation";

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
    <ul className="mx-auto grid h-14 max-w-md grid-cols-4">
      {primaryDestinations(account.id).map((item) => (
        <li key={item.id}>
          <NavLink
            appearance="tab"
            href={item.href}
            isCurrent={current === item.id}
            aria-description={item.id === "you" ? account.name : undefined}
            aria-label={
              item.id === "community" && requestCount > 0
                ? withRequestCount(item.label, requestCount)
                : undefined
            }
          >
            <TabIcon
              key="icon"
              current={current === item.id}
              badge={
                item.id === "community" ? (
                  <FriendRequestBadge
                    decorative
                    count={requestCount}
                    className="absolute -top-1 right-0"
                  />
                ) : undefined
              }
            >
              <PrimaryNavigationIcon area={item.id} account={account} />
            </TabIcon>
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function TabIcon({
  current,
  children,
  badge,
}: {
  current?: boolean;
  children: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <span
      className={clsx(
        "relative flex h-7 w-10 items-center justify-center rounded-lg",
        current && "bg-navigation-active",
      )}
    >
      <span className="flex size-6 items-center justify-center">{children}</span>
      {badge}
    </span>
  );
}
