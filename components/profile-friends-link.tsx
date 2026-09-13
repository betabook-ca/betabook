"use client";

import { buttonVariants } from "@heroui/react";
import { Users } from "lucide-react";

import { FriendRequestBadge } from "@/components/friend-request-badge";
import { useFriendRequests } from "@/components/friend-requests-provider";
import { PROFILE_ACTION_CLASS, PROFILE_ACTION_LABEL_CLASS } from "@/components/profile-actions";
import { AppLink } from "@/components/ui/app-link";

export function ProfileFriendsLink({ userId }: { userId: string }) {
  const requests = useFriendRequests();
  return (
    <AppLink
      href="/friends"
      className={`${buttonVariants({ variant: "outline" })} gap-2 text-foreground no-underline hover:no-underline @max-4xl:px-3 pointer-coarse:min-w-11 ${PROFILE_ACTION_CLASS}`}
    >
      <Users aria-hidden className="size-4" />
      <span className={PROFILE_ACTION_LABEL_CLASS}>Friends</span>
      <FriendRequestBadge count={requests.userId === userId ? requests.count : null} />
    </AppLink>
  );
}
