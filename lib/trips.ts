import { z } from "zod";

import { formatDate } from "@/lib/format-date";
import { isRealIsoDate } from "@/lib/sends";

/** Enough for "Bishop, March 2026" or "Spring road trip — Utah and Nevada"
 * without letting a name push the trip card's heading onto four lines. */
export const MAX_TRIP_NAME = 80;
export const MAX_TRIP_DESCRIPTION = 2000;

/** A ceiling rather than a product limit: trips are cheap rows and a climber
 * with twenty years of history may reasonably keep dozens. It exists so a
 * scripted client cannot fill the table, and it is enforced inside the INSERT
 * so concurrent requests cannot race past it. */
export const MAX_TRIPS = 200;

const isoDate = z.string().refine(isRealIsoDate, "Choose a valid date.");

export const tripInputSchema = z
  .object({
    name: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1, "Name your trip.").max(MAX_TRIP_NAME, "That name is too long.")),
    description: z
      .string()
      .max(MAX_TRIP_DESCRIPTION, "That description is too long.")
      .transform((value) => value.trim() || null)
      .nullable()
      .optional(),
    startDate: isoDate,
    endDate: isoDate,
  })
  .superRefine((value, ctx) => {
    if (value.endDate < value.startDate)
      ctx.addIssue({
        code: "custom",
        message: "End date must be on or after start date.",
        path: ["endDate"],
      });
  });

export function tripsHref(userId: string): string {
  return `/users/${userId}/trips`;
}

/** Each tab is a path segment rather than a query parameter, so it is its own
 * route with its own metadata and its own entry in history — the same shape
 * Projects uses for Open and Sent. */
export type TripTab = "journal" | "sends" | "analytics";

export function tripHref(userId: string, tripId: number, tab: TripTab = "journal"): string {
  const base = `/users/${userId}/trips/${tripId}`;
  // Journal is the trip's own page rather than a child, so a trip link and
  // its first tab are one URL instead of two that render the same thing.
  return tab === "journal" ? base : `${base}/${tab}`;
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

/** The trip's dates as one phrase. A single-day trip reads as one date rather
 * than the same date twice. */
export function formatTripDates(startDate: string, endDate: string): string {
  return startDate === endDate
    ? formatDate(startDate)
    : `${formatDate(startDate)} – ${formatDate(endDate)}`;
}
