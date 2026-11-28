"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useLiveCount } from "@/hooks/use-live-count";
import { createCountStore, type CountStore } from "@/lib/count-store";

const NotificationsContext = createContext<{
  userId: string | null;
  count: number | null;
  refresh: CountStore["refresh"];
}>({ userId: null, count: null, refresh: async () => {} });

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const value = useLiveCount(() => createCountStore("/api/notifications"));
  return <NotificationsContext value={value}>{children}</NotificationsContext>;
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
