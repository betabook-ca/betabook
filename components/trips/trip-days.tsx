import type { ReactNode } from "react";

import { UserSendLogRow } from "@/components/climb-log-row";
import { JournalEntryRow } from "@/components/journal/journal-entry-row";
import { SendActionsMenu } from "@/components/send-actions-menu";
import {
  TripDayOrderControl,
  TripDayOrderList,
  TripDayOrderProvider,
} from "@/components/trips/trip-day-order";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/typography";
import type { AreaBreadcrumbs, JournalEntry, UserSendRow } from "@/db/queries";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";
import { formatCount } from "@/lib/format";
import type { TripDay } from "@/lib/trip-days";

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** The two halves of a day's heading, "Day 3" and "Thu, Mar 12". The visible
 * heading and its accessible name are both built from these. */
function dayLabelParts(day: Pick<TripDay<unknown, unknown>, "date" | "dayNumber">) {
  return { number: `Day ${day.dayNumber}`, date: DAY_FORMAT.format(new Date(day.date)) };
}

/** "Day 3 · Thu, Mar 12" */
function dayLabel(day: Pick<TripDay<unknown, unknown>, "date" | "dayNumber">): string {
  const { number, date } = dayLabelParts(day);
  return `${number} · ${date}`;
}

/** "Dim Cave · Best Face": each crag the day's rows were at, once, in the
 * order logged. Just the climb's own area, with no ancestors; training with no
 * climb adds nothing. */
function dayCrags({ items }: TripDay<UserSendRow, JournalEntry>): string {
  const crags = new Map<number, string>();
  for (const item of items) {
    const { areaId, areaName } = item.kind === "send" ? item.send : item.entry;
    if (areaId != null && areaName != null && !crags.has(areaId)) crags.set(areaId, areaName);
  }
  return [...crags.values()].join(" · ");
}

/** "2 sends · 1 repeat · 1 session · 1 training session". Counts only what is
 * listed, so a reader without journal access sees sends alone, and names each
 * row the way its status chip does in `JournalEntryRow`. */
function daySummary({ items }: TripDay<UserSendRow, JournalEntry>): string {
  let sends = 0;
  let repeats = 0;
  let sessions = 0;
  let training = 0;
  for (const item of items) {
    if (item.kind === "send" || item.entry.isAscent) sends += 1;
    else if (item.entry.kind === "training") training += 1;
    else if (item.entry.sent) repeats += 1;
    else sessions += 1;
  }
  return [
    sends > 0 && formatCount(sends, "send"),
    repeats > 0 && formatCount(repeats, "repeat"),
    sessions > 0 && formatCount(sessions, "session"),
    training > 0 && formatCount(training, "training session"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A day card's sticky header: the day and date, the crags under them, and
 * what the day holds on the right. */
function TripDayHeader({ day }: { day: TripDay<UserSendRow, JournalEntry> }) {
  const { number, date } = dayLabelParts(day);
  const crags = dayCrags(day);
  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-separator bg-surface-secondary px-4 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-foreground">
          {number}{" "}
          <time dateTime={day.date} className="font-normal text-muted">
            · {date}
          </time>
        </h3>
        {crags && <p className="text-xs text-muted">{crags}</p>}
      </div>
      <p className="text-xs text-muted">{daySummary(day)}</p>
    </header>
  );
}

/** A trip's sends and journal entries as one card per day with something
 * logged, under `heading` with the order button at the end of its line.
 * Entries are left out when the viewer can't read the journal; `groupTripDays`
 * builds the days oldest first, and the button reverses them in the browser.
 * The button shows only when there are two days to order. */
export function TripDays({
  heading,
  days,
  areaBreadcrumbs,
  userId,
  isOwner,
  linkTags = true,
  emptyMessage,
  notice,
}: {
  /** The section heading, such as "Days". The page's loading skeleton shows
   * the same text, so the heading doesn't move when the days arrive. */
  heading?: ReactNode;
  days: TripDay<UserSendRow, JournalEntry>[];
  areaBreadcrumbs: AreaBreadcrumbs;
  userId: string;
  /** Adds the edit menus to each row. */
  isOwner: boolean;
  /** Whether entry hashtags link to the Journal. Off on a trip link's page. */
  linkTags?: boolean;
  emptyMessage: string;
  /** A note above the days, such as the one for a trip too long to show. */
  notice?: ReactNode;
}) {
  return (
    <TripDayOrderProvider>
      <div className="flex flex-col gap-3">
        {heading && (
          <div className="flex items-center justify-between gap-2">
            <SectionHeading>{heading}</SectionHeading>
            {days.length > 1 && <TripDayOrderControl />}
          </div>
        )}
        {notice && <div className="text-sm text-muted">{notice}</div>}
        {days.length === 0 ? (
          <EmptyState message={emptyMessage} />
        ) : (
          <TripDayCards
            days={days}
            areaBreadcrumbs={areaBreadcrumbs}
            userId={userId}
            isOwner={isOwner}
            linkTags={linkTags}
          />
        )}
      </div>
    </TripDayOrderProvider>
  );
}

function TripDayCards({
  days,
  areaBreadcrumbs,
  userId,
  isOwner,
  linkTags,
}: {
  days: TripDay<UserSendRow, JournalEntry>[];
  areaBreadcrumbs: AreaBreadcrumbs;
  userId: string;
  isOwner: boolean;
  linkTags: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <TripDayOrderList
        days={days.map((day) => (
          // overflow-clip rounds the header and rows to the card without making
          // the card a scroll container, which would stop the header sticking.
          <section
            key={day.date}
            aria-label={dayLabel(day)}
            className={`overflow-clip ${cardClass("none", "bordered")}`}
          >
            <TripDayHeader day={day} />
            {/* Rows raise their grade column to z-10; keeping them in their own
              stacking context lets the sticky header cover them. */}
            <ul role="list" className="relative z-0 flex flex-col divide-y divide-separator">
              {day.items.map((item) =>
                item.kind === "send" ? (
                  // Keyed by climb id, and entries by their place in the day.
                  // Keys end up in the RSC payload, which a trip link's
                  // readers can see, and sequential ids shouldn't.
                  <li key={`send-${item.send.climbId}`}>
                    <UserSendLogRow
                      send={item.send}
                      areaBreadcrumbs={areaBreadcrumbs}
                      actions={isOwner && <SendActionsMenu send={item.send} />}
                    />
                  </li>
                ) : (
                  <li key={`entry-${item.position}`}>
                    <JournalEntryRow
                      entry={item.entry}
                      isOwner={isOwner}
                      userId={userId}
                      filter={DEFAULT_JOURNAL_FILTER}
                      areaBreadcrumbs={areaBreadcrumbs}
                      linkTags={linkTags}
                    />
                  </li>
                ),
              )}
            </ul>
          </section>
        ))}
      />
    </div>
  );
}
