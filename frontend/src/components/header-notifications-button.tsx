"use client";

import { buttonVariants } from "@heroui/styles";
import { Bell } from "lucide-react";

import { FriendRequestBadge } from "@/components/friend-request-badge";
import { useNotifications } from "@/components/notifications-provider";
import { AppLink } from "@/components/ui/app-link";
import { useClientSession } from "@/hooks/use-client-session";
import { formatCount } from "@/lib/format";

function notificationsLabel(count: number | null) {
  return count && count > 0
    ? `Notifications, ${formatCount(count, "unread alert")}`
    : "Notifications";
}

export function HeaderNotificationsButton() {
  const signedIn = Boolean(useClientSession());
  const { count } = useNotifications();
  if (!signedIn) return null;
  return (
    <AppLink
      href="/notifications"
      aria-label={notificationsLabel(count)}
      className={`${buttonVariants({ variant: "ghost", isIconOnly: true })} relative size-11 md:size-10`}
    >
      <Bell aria-hidden="true" className="size-5" />
      <FriendRequestBadge
        count={count}
        decorative
        compact
        className="absolute -top-0.5 -right-0.5"
      />
    </AppLink>
  );
}
