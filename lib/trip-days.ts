import { daysBetween } from "@/lib/format-date";

type TripDayItem<Send, Entry> = { kind: "send"; send: Send } | { kind: "entry"; entry: Entry };

export type TripDay<Send, Entry> = {
  date: string;
  /** 1 on the trip's first day. */
  dayNumber: number;
  items: TripDayItem<Send, Entry>[];
};

/** Order of the trip page's days. Oldest first reads the trip as it
 * happened; newest first suits a trip still in progress. */
export type TripDayOrder = "oldest" | "newest";

/** URL parameter for the order. Absent means oldest first, so a plain trip
 * link keeps the default. The page reads it once to start in that order; the
 * order button then reverses the days in the browser and rewrites it. */
export const TRIP_DAY_ORDER_PARAM = "order";

export function parseTripDayOrder(value: string | string[] | undefined): TripDayOrder {
  return value === "newest" ? "newest" : "oldest";
}

function earliest(dates: (string | null)[]): string | null {
  let min: string | null = null;
  for (const date of dates) if (date && (!min || date < min)) min = date;
  return min;
}

/** Groups a trip's sends and journal entries by date, oldest day first. Days
 * with nothing logged are left out.
 *
 * A send replaces every entry for the same climb on its date. The ascent entry
 * repeats the send, and other entries that day would list the climb twice. The
 * send takes the place of the first such entry, so it stays in the order the
 * day was logged. Entries on other days, such as earlier attempts or repeats,
 * are kept. Sends with no matching entry, for example when the viewer can't
 * read the journal, follow the entries in id order.
 *
 * The reads behind `sends` and `entries` are newest first and may stop at a
 * limit. Mark a read that stopped with `sendsCapped` or `entriesCapped`. Its
 * oldest date may be incomplete, so that day and every earlier one are left
 * out, and `truncated` is true. */
export function groupTripDays<
  Send extends { id: number; climbId: number; dateSent: string | null },
  Entry extends { id: number; climbId: number | null; entryDate: string },
>({
  startDate,
  sends,
  entries,
  sendsCapped = false,
  entriesCapped = false,
}: {
  startDate: string;
  sends: Send[];
  entries: Entry[];
  sendsCapped?: boolean;
  entriesCapped?: boolean;
}): { days: TripDay<Send, Entry>[]; truncated: boolean } {
  let after: string | null = null;
  for (const cutoff of [
    sendsCapped ? earliest(sends.map((send) => send.dateSent)) : null,
    entriesCapped ? earliest(entries.map((entry) => entry.entryDate)) : null,
  ]) {
    if (cutoff && (!after || cutoff > after)) after = cutoff;
  }
  const include = (date: string | null): date is string =>
    date !== null && (after === null || date > after);

  const sendsByDate = new Map<string, Map<number, Send>>();
  for (const send of [...sends].sort((a, b) => a.id - b.id)) {
    if (!include(send.dateSent)) continue;
    const day = sendsByDate.get(send.dateSent) ?? new Map<number, Send>();
    day.set(send.climbId, send);
    sendsByDate.set(send.dateSent, day);
  }

  const entriesByDate = new Map<string, Entry[]>();
  for (const entry of [...entries].sort((a, b) => a.id - b.id)) {
    if (!include(entry.entryDate)) continue;
    const day = entriesByDate.get(entry.entryDate) ?? [];
    day.push(entry);
    entriesByDate.set(entry.entryDate, day);
  }

  const dates = [...new Set([...sendsByDate.keys(), ...entriesByDate.keys()])].sort();
  const days = dates.map((date) => {
    const unplaced = new Map(sendsByDate.get(date));
    const sentClimbs = new Set(unplaced.keys());
    const items: TripDayItem<Send, Entry>[] = [];
    for (const entry of entriesByDate.get(date) ?? []) {
      if (entry.climbId === null || !sentClimbs.has(entry.climbId)) {
        items.push({ kind: "entry", entry });
        continue;
      }
      const send = unplaced.get(entry.climbId);
      if (send) {
        items.push({ kind: "send", send });
        unplaced.delete(entry.climbId);
      }
    }
    for (const send of unplaced.values()) items.push({ kind: "send", send });
    return { date, dayNumber: (daysBetween(startDate, date) ?? 0) + 1, items };
  });
  return { days, truncated: after !== null };
}
