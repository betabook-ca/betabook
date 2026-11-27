import { clsx } from "clsx";

import {
  FriendRequestBadge,
  FriendRequestDot,
  withRequestCount,
} from "@/components/friend-request-badge";
import { NavLink } from "@/components/nav-link";
import { PrimaryNavigationIcon } from "@/components/primary-navigation-icon";
import type { PrimaryDestination } from "@/lib/app-navigation";
import { formatCount } from "@/lib/format";

function notificationLabel(
  item: PrimaryDestination,
  requestCount: number,
  notificationCount: number | undefined,
  tab: boolean,
) {
  if (tab && notificationCount !== undefined) {
    return notificationCount > 0
      ? `${item.label}, ${formatCount(notificationCount, "notification")}`
      : undefined;
  }
  return item.id === "community" && requestCount > 0
    ? withRequestCount(item.label, requestCount)
    : undefined;
}

/** Shared rendering for real navigation and lesson-local navigation previews. */
export function PrimaryNavigationLink({
  item,
  account,
  current,
  appearance,
  collapsed = false,
  requestCount = 0,
  notificationCount,
  onNavigate,
}: {
  item: PrimaryDestination;
  account: { name: string; image?: string | null };
  current: boolean;
  appearance: "sidebar" | "menu" | "tab";
  collapsed?: boolean;
  requestCount?: number;
  notificationCount?: number;
  onNavigate?: () => void;
}) {
  const community = item.id === "community";
  const tab = appearance === "tab";
  const tabCount = notificationCount ?? (community ? requestCount : 0);
  return (
    <NavLink
      href={item.href}
      appearance={appearance}
      isCurrent={current}
      onClick={onNavigate}
      aria-description={item.id === "account" ? account.name : undefined}
      aria-label={notificationLabel(item, requestCount, notificationCount, tab)}
      className={
        tab
          ? undefined
          : clsx("justify-start", appearance === "sidebar" ? "overflow-hidden" : "min-h-12")
      }
    >
      <span className={clsx("min-w-0 truncate", collapsed && "opacity-0")}>{item.label}</span>{" "}
      <span
        className={
          tab
            ? "relative order-first flex h-7 w-10 items-center justify-center"
            : "relative order-first shrink-0"
        }
      >
        <PrimaryNavigationIcon area={item.id} active={current} />
        {tab && tabCount > 0 ? (
          <FriendRequestBadge
            compact
            decorative
            count={tabCount}
            className="absolute top-0 left-[calc(50%+0.875rem)]"
          />
        ) : community && collapsed && requestCount > 0 ? (
          <FriendRequestDot className="absolute -top-1 -right-1" />
        ) : null}
      </span>
      {/* Flex layout drops this space visually, but it keeps the visible text
          reading "Community 3" rather than "Community3", so the aria-label's
          "Community, 3 pending friend requests" still contains it (WCAG 2.5.3). */}
      {community && !tab && !collapsed && (
        <>
          {" "}
          <FriendRequestBadge decorative count={requestCount} className="ms-auto" />
        </>
      )}
    </NavLink>
  );
}
