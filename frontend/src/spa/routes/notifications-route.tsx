import { useEffect } from "react";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { NotificationList } from "@/components/notification-list";
import { useNotifications } from "@/components/notifications-provider";
import { markNotificationsRead } from "@/spa/lib/actions-client";
import { fetchApi } from "@/spa/lib/api";
import { useRetainedPage } from "@/spa/lib/use-retained-page";

export default function NotificationsRoute({ viewerId }: { viewerId: string | null }) {
  const { refresh } = useNotifications();
  const { data, error } = useRetainedPage({
    scope: viewerId,
    query: "",
    load: async (signal) => {
      const page = await fetchApi("/api/notifications", { signal, sessionEvents: true });
      if (!("alerts" in page)) throw new Error("Unexpected notifications response");
      return page;
    },
  });
  const newest = data?.alerts.some((alert) => alert.unread) ? data.alerts[0].updatedAt : null;

  useEffect(() => {
    if (!viewerId || newest === null) return;
    void markNotificationsRead(newest).then(
      () => refresh(),
      () => {},
    );
  }, [viewerId, newest, refresh]);

  if (!viewerId) return <CurrentPageAuthCallout />;
  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Notifications</h1>
      <NotificationList alerts={data?.alerts} error={Boolean(error)} />
    </div>
  );
}
