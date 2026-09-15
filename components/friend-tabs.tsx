"use client";

import { useEffect, useRef } from "react";

import { FriendRequestBadge } from "@/components/friend-request-badge";
import { useFriendRequests } from "@/components/friend-requests-provider";
import { SectionNavigation } from "@/components/ui/section-navigation";

export function FriendTabs({ view, userId }: { view: "friends" | "requests"; userId: string }) {
  const requests = useFriendRequests();
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current !== view) {
      previousView.current = view;
      void requests.refresh();
    }
  }, [view, requests]);

  return (
    <SectionNavigation
      appearance="pills"
      label="Friend lists"
      tabs={[
        { href: "/friends", label: "Friends", current: view === "friends" },
        {
          href: "/friends?view=requests",
          label: "Requests",
          current: view === "requests",
          badge: <FriendRequestBadge count={requests.userId === userId ? requests.count : null} />,
        },
      ]}
    />
  );
}
