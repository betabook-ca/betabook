"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useClientSession } from "@/hooks/use-client-session";
import type { CountStore } from "@/lib/count-store";
import { usePathname } from "@/spa/lib/navigation";

/** Keeps a signed-in count fresh on focus, visibility and navigation. */
export function useLiveCount(createStore: () => CountStore) {
  const userId = useClientSession()?.user.id ?? null;
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const [store] = useState(createStore);
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

  return {
    userId,
    count: snapshot.userId === userId ? snapshot.count : null,
    refresh: store.refresh,
  };
}
