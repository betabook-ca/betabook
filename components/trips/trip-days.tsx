import { UserSendLogRow } from "@/components/climb-log-row";
import { JournalEntryRow } from "@/components/journal/journal-entry-row";
import { SendActionsMenu } from "@/components/send-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { EYEBROW_CLASS } from "@/components/ui/eyebrow";
import type { AreaBreadcrumbs, JournalEntry, UserSendRow } from "@/db/queries";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";
import type { TripDay } from "@/lib/trip-days";

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

/** A trip's sends and journal entries under a heading for each day with
 * something logged. Entries are left out when the viewer can't read the
 * journal; `groupTripDays` builds the days. */
export function TripDays({
  days,
  areaBreadcrumbs,
  userId,
  isOwner,
  emptyMessage,
}: {
  days: TripDay<UserSendRow, JournalEntry>[];
  areaBreadcrumbs: AreaBreadcrumbs;
  userId: string;
  /** Adds the edit menus to each row. */
  isOwner: boolean;
  emptyMessage: string;
}) {
  if (days.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <div className="flex flex-col">
      {days.map((day) => (
        <section key={day.date} aria-label={dayLabel(day)}>
          <h3
            className={`sticky top-0 z-10 border-b border-separator bg-background px-4 py-2 ${EYEBROW_CLASS}`}
          >
            <time dateTime={day.date}>{dayLabel(day)}</time>
          </h3>
          <ul role="list" className="flex flex-col divide-y divide-separator">
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
