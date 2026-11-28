"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useLiveCount } from "@/hooks/use-live-count";
import { createFriendRequestCountStore, type CountStore } from "@/lib/friend-request-count";

const FriendRequestsContext = createContext<{
  userId: string | null;
  count: number | null;
  refresh: CountStore["refresh"];
}>({
  userId: null as string | null,
  count: null as number | null,
  refresh: async () => {},
});

export function FriendRequestsProvider({ children }: { children: ReactNode }) {
  const value = useLiveCount(createFriendRequestCountStore);
  return <FriendRequestsContext value={value}>{children}</FriendRequestsContext>;
}

export function useFriendRequests() {
  return useContext(FriendRequestsContext);
}

/** Pending requests for the signed-in climber; 0 until known. */
export function useFriendRequestCount() {
  return useContext(FriendRequestsContext).count ?? 0;
}
