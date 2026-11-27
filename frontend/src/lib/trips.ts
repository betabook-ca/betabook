import { formatDate } from "@/lib/format-date";
/** Enough for "Bishop, March 2026" or "Spring road trip — Utah and Nevada"
 * without letting a name push the trip card's heading onto four lines. */
export const MAX_TRIP_NAME = 80;
/** Max description length. The column's CHECK still allows 2,000, its original
 * limit. Longer text belongs in notes. */
export const MAX_TRIP_DESCRIPTION = 160;
/** Max notes length, about 3,000 words. The column's CHECK is higher, so this
 * can be raised without a migration. */
export const MAX_TRIP_NOTES = 20_000;

/** Collapses line breaks and extra whitespace into single spaces, so a pasted
 * paragraph is accepted as one line instead of being rejected. */
export function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function tripsHref(userId: string): string {
  return `/users/${userId}/trips`;
}

export function tripHref(userId: string, tripId: number): string {
  return `/users/${userId}/trips/${tripId}`;
}

export function tripAnalyticsHref(userId: string, tripId: number): string {
  return `${tripHref(userId, tripId)}/analytics`;
}

/** Link to the Journal or Sends tab, filtered to the trip's dates. */
export function tripLogbookHref(
  userId: string,
  page: "journal" | "sends",
  trip: { startDate: string; endDate: string },
): string {
  const dates = new URLSearchParams({ dateFrom: trip.startDate, dateTo: trip.endDate });
  return `/users/${userId}/${page}?${dates}`;
}

export type TripStatus = "upcoming" | "current" | "past";

/** Where the trip sits relative to the reader's own day.
 *
 * `today` is the caller's `YYYY-MM-DD` and there is no default. Reading the
 * clock here would put the current date inside a render that runs on the
 * server and again on the client, which is how a card ends up disagreeing with
 * its own hydration — the same rule `isShareExpired` follows. */
export function tripStatus(
  trip: { startDate: string; endDate: string },
  today: string,
): TripStatus {
  if (today < trip.startDate) return "upcoming";
  return today > trip.endDate ? "past" : "current";
}

/** Only upcoming and in-progress trips get a status label. Most trips are in
 * the past, so a label for those would be on nearly every card.
 *
 * The in-progress label uses `success`, which is otherwise only used for
 * ascent styles. */
export const TRIP_STATUS_LABEL: Partial<
  Record<TripStatus, { label: string; color: "success" | "default" }>
> = {
  upcoming: { label: "Upcoming", color: "default" },
  current: { label: "On now", color: "success" },
};

/** The trip's dates as one phrase. A single-day trip reads as one date rather
 * than the same date twice. */
export function formatTripDates(startDate: string, endDate: string): string {
  return startDate === endDate
    ? formatDate(startDate)
    : `${formatDate(startDate)} – ${formatDate(endDate)}`;
}
