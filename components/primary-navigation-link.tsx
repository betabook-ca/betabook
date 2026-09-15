import { clsx } from "clsx";

import {
  FriendRequestBadge,
  FriendRequestDot,
  withRequestCount,
} from "@/components/friend-request-badge";
import { NavLink } from "@/components/nav-link";
import { PrimaryNavigationIcon } from "@/components/primary-navigation-icon";
import type { PrimaryDestination } from "@/lib/app-navigation";

/** Shared rendering for real navigation and lesson-local navigation previews. */
export function PrimaryNavigationLink({
  item,
  account,
  current,
  appearance,
  collapsed = false,
  requestCount = 0,
  onNavigate,
}: {
  item: PrimaryDestination;
  account: { name: string; image?: string | null };
  current: boolean;
  appearance: "sidebar" | "menu" | "tab";
  collapsed?: boolean;
  requestCount?: number;
  onNavigate?: () => void;
}) {
  const community = item.id === "community";
  const tab = appearance === "tab";
  return (
    <NavLink
      href={item.href}
      appearance={appearance}
      isCurrent={current}
      onClick={onNavigate}
      aria-description={item.id === "you" ? account.name : undefined}
      aria-label={
        community && requestCount > 0 ? withRequestCount(item.label, requestCount) : undefined
      }
      className={
        tab
          ? undefined
          : clsx("justify-start", appearance === "sidebar" ? "overflow-hidden" : "min-h-12")
      }
    >
      <span
        key="icon"
        className={
          tab
            ? clsx(
                "relative flex h-7 w-10 items-center justify-center rounded-lg",
                current && "bg-navigation-active",
              )
            : "relative shrink-0"
        }
      >
        <PrimaryNavigationIcon area={item.id} account={account} />
        {community &&
          (tab ? (
            <FriendRequestBadge
              decorative
              count={requestCount}
              className="absolute -top-1 right-0"
            />
          ) : collapsed && requestCount > 0 ? (
            <FriendRequestDot className="absolute -top-1 -right-1" />
          ) : null)}
      </span>
      <span key="label" className={clsx("min-w-0 truncate", collapsed && "opacity-0")}>
        {item.label}
      </span>
      {community && !tab && !collapsed && (
        <FriendRequestBadge key="requests" decorative count={requestCount} className="ms-auto" />
      )}
    </NavLink>
  );
}
