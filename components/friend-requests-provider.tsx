"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { useClientSession } from "@/hooks/use-client-session";
import { createFriendRequestCountStore } from "@/lib/friend-request-count";

const FriendRequestsContext = createContext({
  userId: null as string | null,
  count: null as number | null,
  refresh: async () => {},
});

export function FriendRequestsProvider({ children }: { children: ReactNode }) {
  const userId = useClientSession()?.user.id ?? null;
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const [store] = useState(() => createFriendRequestCountStore());
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    store.setUser(userId);
    if (!userId) return;
    function refreshVisible() {
      if (document.visibilityState === "visible") void store.refresh({ ifStale: true });
    }
    refreshVisible();
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      store.setUser(null);
    };
  }, [store, userId]);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      if (document.visibilityState === "visible") void store.refresh({ ifStale: true });
    }
  }, [pathname, store]);

  const value = useMemo(
    () => ({
      userId,
      count: snapshot.userId === userId ? snapshot.count : null,
      refresh: store.refresh,
    }),
    [userId, snapshot, store],
  );
  return <FriendRequestsContext value={value}>{children}</FriendRequestsContext>;
}

export function useFriendRequests() {
  return useContext(FriendRequestsContext);
}

/** Pending requests for the signed-in climber; 0 until known. */
export function useFriendRequestCount() {
  return useContext(FriendRequestsContext).count ?? 0;
}
