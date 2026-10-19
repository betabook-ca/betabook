import type { ReactNode } from "react";

import { UserSendLogRow } from "@/components/climb-log-row";
import { JournalEntryRow } from "@/components/journal/journal-entry-row";
import { NavigationPendingRegion } from "@/components/navigation-pending";
import { SendActionsMenu } from "@/components/send-actions-menu";
import { TripDayOrderControl } from "@/components/trips/trip-day-order";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/typography";
import type { AreaBreadcrumbs, JournalEntry, UserSendRow } from "@/db/queries";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";
import { formatCount } from "@/lib/format";
import type { TripDay, TripDayOrderLinks } from "@/lib/trip-days";

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "Day 3 · Thu, Mar 12" */
function dayLabel(day: Pick<TripDay<unknown, unknown>, "date" | "dayNumber">): string {
  return `Day ${day.dayNumber} · ${DAY_FORMAT.format(new Date(day.date))}`;
}

/** "2 sends · 1 session · 1 training session". Counts only what is listed, so
 * a reader without journal access sees sends alone. */
function daySummary({ items }: TripDay<UserSendRow, JournalEntry>): string {
  let sends = 0;
  let sessions = 0;
  let training = 0;
  for (const item of items) {
    if (item.kind === "send") sends += 1;
    else if (item.entry.kind === "training") training += 1;
    else sessions += 1;
  }
  return [
    sends > 0 && formatCount(sends, "send"),
    sessions > 0 && formatCount(sessions, "session"),
    training > 0 && formatCount(training, "training session"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The days section's heading, with the order button at the end of the line.
 * Wrap the heading and `TripDays` in one `NavigationPendingProvider`, so the
 * cards dim while a new order loads. */
export function TripDaysHeading({
  children,
  order,
}: {
  children: ReactNode;
  /** Omit when there is at most one thing to order. */
  order?: TripDayOrderLinks;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <SectionHeading>{children}</SectionHeading>
      {order && <TripDayOrderControl order={order} />}
    </div>
  );
}

/** A trip's sends and journal entries as one card per day with something
 * logged. Entries are left out when the viewer can't read the journal;
 * `groupTripDays` builds the days, already in order. */
export function TripDays({
  days,
  areaBreadcrumbs,
  userId,
  isOwner,
  emptyMessage,
  notice,
}: {
  days: TripDay<UserSendRow, JournalEntry>[];
  areaBreadcrumbs: AreaBreadcrumbs;
  userId: string;
  /** Adds the edit menus to each row. */
  isOwner: boolean;
  emptyMessage: string;
  /** A note above the days, such as the one for a trip too long to show. */
  notice?: ReactNode;
}) {
  if (days.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <div className="flex flex-col gap-3">
      {notice && <div className="text-sm text-muted">{notice}</div>}
      <NavigationPendingRegion>
        <TripDayCards
          days={days}
          areaBreadcrumbs={areaBreadcrumbs}
          userId={userId}
          isOwner={isOwner}
        />
      </NavigationPendingRegion>
    </div>
  );
}

function TripDayCards({
  days,
  areaBreadcrumbs,
  userId,
  isOwner,
}: {
  days: TripDay<UserSendRow, JournalEntry>[];
  areaBreadcrumbs: AreaBreadcrumbs;
  userId: string;
  isOwner: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        // overflow-clip rounds the header and rows to the card without making
        // the card a scroll container, which would stop the header sticking.
        <section
          key={day.date}
          aria-label={dayLabel(day)}
          className={`overflow-clip ${cardClass("none", "bordered")}`}
        >
          <header className="sticky top-0 z-10 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-separator bg-surface-secondary px-4 py-2.5">
            <h3 className="text-sm font-semibold text-foreground">
              Day {day.dayNumber}{" "}
              <time dateTime={day.date} className="font-normal text-muted">
                · {DAY_FORMAT.format(new Date(day.date))}
              </time>
            </h3>
            <p className="text-xs text-muted">{daySummary(day)}</p>
          </header>
          {/* Rows raise their grade column to z-10; keeping them in their own
              stacking context lets the sticky header cover them. */}
          <ul role="list" className="relative z-0 flex flex-col divide-y divide-separator">
            {day.items.map((item) =>
              item.kind === "send" ? (
                // Keyed by climb id. Keys end up in the RSC payload, and
                // sequential send ids shouldn't.
                <li key={`send-${item.send.climbId}`}>
                  <UserSendLogRow
                    send={item.send}
                    areaBreadcrumbs={areaBreadcrumbs}
                    actions={isOwner && <SendActionsMenu send={item.send} />}
                  />
                </li>
              ) : (
                <li key={`entry-${item.entry.id}`}>
                  <JournalEntryRow
                    entry={item.entry}
                    isOwner={isOwner}
                    userId={userId}
                    filter={DEFAULT_JOURNAL_FILTER}
                    areaBreadcrumbs={areaBreadcrumbs}
                  />
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
