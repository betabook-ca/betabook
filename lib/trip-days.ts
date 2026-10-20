import { daysBetween } from "@/lib/format-date";

type TripDayItem<Send, Entry> =
  | { kind: "send"; send: Send }
  /** `position` is the row's place in the day, from 1: a key that, unlike the
   * entry id, a trip link's readers may see. */
  | { kind: "entry"; entry: Entry; position: number };

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

/** Most sends, and most journal entries, a trip page reads. Trips have no
 * length limit, so a longer one shows its latest days. */
export const TRIP_DAYS_LIMIT = 300;

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
 * A send takes the place of its ascent entry, which only repeats it, so the
 * send keeps the position the day was logged in. Every other entry is kept,
 * including failed sessions and repeats of the same climb that day. Sends
 * with no ascent entry, for example when the viewer can't read the journal,
 * follow the entries in id order.
 *
 * The reads behind `sends` and `entries` are newest first and may stop at a
 * limit. Mark a read that stopped with `sendsCapped` or `entriesCapped`. Its
 * oldest date may be incomplete, so that day and every earlier one are left
 * out, and `truncated` is true. If the read reached only one date, that day is
 * kept even though it may be partial, rather than leaving nothing, and
 * `partialDate` names it so the page can say so. */
export function groupTripDays<
  Send extends { id: number; climbId: number; dateSent: string | null },
  Entry extends { id: number; climbId: number | null; entryDate: string; isAscent: boolean },
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
}): { days: TripDay<Send, Entry>[]; truncated: boolean; partialDate: string | null } {
  let after: string | null = null;
  for (const cutoff of [
    sendsCapped ? earliest(sends.map((send) => send.dateSent)) : null,
    entriesCapped ? earliest(entries.map((entry) => entry.entryDate)) : null,
  ]) {
    if (cutoff && (!after || cutoff > after)) after = cutoff;
  }
  const cutoff = after;
  // Nothing newer than the cutoff: keep the cutoff day, partial as it may be.
  const keepCutoffDay =
    cutoff !== null &&
    ![...sends.map((send) => send.dateSent), ...entries.map((entry) => entry.entryDate)].some(
      (date) => date !== null && date > cutoff,
    );
  const include = (date: string | null): date is string =>
    date !== null && (cutoff === null || date > cutoff || (keepCutoffDay && date === cutoff));

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
    const items: TripDayItem<Send, Entry>[] = [];
    for (const entry of entriesByDate.get(date) ?? []) {
      const send = entry.isAscent && entry.climbId !== null && unplaced.get(entry.climbId);
      if (send) {
        items.push({ kind: "send", send });
        unplaced.delete(send.climbId);
      } else {
        items.push({ kind: "entry", entry, position: items.length + 1 });
      }
    }
    for (const send of unplaced.values()) items.push({ kind: "send", send });
    return { date, dayNumber: (daysBetween(startDate, date) ?? 0) + 1, items };
  });
  return { days, truncated: after !== null, partialDate: keepCutoffDay ? cutoff : null };
}
