"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useLiveCount } from "@/hooks/use-live-count";
import { createNotificationCountStore, type CountStore } from "@/lib/friend-request-count";

const NotificationsContext = createContext<{
  count: number | null;
  refresh: CountStore["refresh"];
}>({ count: null, refresh: async () => {} });

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { count, refresh } = useLiveCount(createNotificationCountStore);
  return <NotificationsContext value={{ count, refresh }}>{children}</NotificationsContext>;
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
