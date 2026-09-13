"use client";

import { buttonVariants } from "@heroui/react";
import { Users } from "lucide-react";

import { FriendRequestBadge } from "@/components/friend-request-badge";
import { useFriendRequests } from "@/components/friend-requests-provider";
import { AppLink } from "@/components/ui/app-link";

export function ProfileFriendsLink({ userId }: { userId: string }) {
  const requests = useFriendRequests();
  return (
    <AppLink
      href="/friends"
      className={`${buttonVariants({ variant: "outline" })} gap-2 text-foreground no-underline hover:no-underline`}
    >
      <Users aria-hidden className="size-4" />
      Friends
      <FriendRequestBadge count={requests.userId === userId ? requests.count : null} />
    </AppLink>
  );
}
