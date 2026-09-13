"use client";

import { Users } from "lucide-react";

import { FriendRequestBadge } from "@/components/friend-request-badge";
import { useFriendRequests } from "@/components/friend-requests-provider";
import { AppLink } from "@/components/ui/app-link";

export function ProfileFriendsLink({ userId }: { userId: string }) {
  const requests = useFriendRequests();
  return (
    <AppLink href="/friends" className="inline-flex w-fit items-center gap-1.5 text-sm">
      <Users aria-hidden className="size-4" />
      Friends
      <FriendRequestBadge count={requests.userId === userId ? requests.count : null} />
    </AppLink>
  );
}
