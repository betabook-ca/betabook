import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import { GradeLabel } from "@/components/ui/grade-label";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { SendAlert } from "@/lib/community-types";
import { formatCount } from "@/lib/format";
import { formatDate } from "@/lib/format-date";

export function sendAlertHref(alert: Pick<SendAlert, "userId" | "date">) {
  return `/users/${alert.userId}/sends?date=${alert.date}`;
}

export function sendAlertSummary(alert: SendAlert) {
  const [first] = alert.climbs;
  if (alert.sends === 1 && first) return `${alert.name} sent ${first.name}`;
  return `${alert.name} sent ${formatCount(alert.sends, "climb")}`;
}

export function NotificationList({
  alerts,
  pending = false,
  error = false,
}: {
  alerts: SendAlert[] | undefined;
  pending?: boolean;
  error?: boolean;
}) {
  if (error) return <EmptyState message="Couldn't load notifications. Try again." />;
  if (pending || !alerts) return <SkeletonListRows rows={4} />;
  if (alerts.length === 0)
    return (
      <EmptyState message="When friends log sends, they show up here. You can turn alerts off under Account › Privacy." />
    );
  return (
    <ul className="flex flex-col divide-y divide-separator" aria-label="Send alerts">
      {alerts.map((alert) => (
        <li key={`${alert.userId}:${alert.date}`}>
          <AppLink
            href={sendAlertHref(alert)}
            className="flex items-start gap-3 py-3 text-foreground no-underline"
          >
            <UserAvatar name={alert.name} image={alert.image} size="sm" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className="min-w-0 truncate">{sendAlertSummary(alert)}</span>
                {alert.unread && (
                  <>
                    <span className="sr-only">, unread</span>
                    <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent" />
                  </>
                )}
              </span>
              {alert.sends > 1 && (
                <span className="truncate text-sm text-muted">
                  {alert.climbs.map((climb, index) => (
                    <span key={climb.id}>
                      {index > 0 && ", "}
                      {climb.name}
                      {climb.type && (
                        <>
                          {" "}
                          <GradeLabel type={climb.type} grade={climb.grade} />
                        </>
                      )}
                    </span>
                  ))}
                  {alert.sends > alert.climbs.length &&
                    ` and ${formatCount(alert.sends - alert.climbs.length, "more", "more")}`}
                </span>
              )}
              <span className="text-xs text-muted">{formatDate(alert.date)}</span>
            </span>
          </AppLink>
        </li>
      ))}
    </ul>
  );
}
