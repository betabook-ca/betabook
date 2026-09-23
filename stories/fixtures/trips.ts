import type { TripSummary } from "@/db/queries";

/** A fixed "today" so the status chips are the same in every render of these
 * stories — `new Date()` here would make "Upcoming" flip to "On now" on the
 * day the sample dates happen to arrive. */
export const TRIPS_TODAY = "2026-04-15";

export const tripSamples: TripSummary[] = [
  {
    id: 3,
    name: "Squamish, July 2026",
    description: "Two weeks in the Bakery and whatever the weather allows on the Chief.",
    startDate: "2026-07-04",
    endDate: "2026-07-18",
    entryCount: 0,
    sendCount: 0,
    dayCount: 0,
  },
  {
    id: 2,
    name: "Bishop, March 2026",
    description: "Buttermilks and the Happies. Went with Sam and Priya.",
    startDate: "2026-03-10",
    endDate: "2026-03-20",
    entryCount: 14,
    sendCount: 9,
    dayCount: 7,
  },
  {
    id: 1,
    name: "A day at the Gunks",
    description: null,
    startDate: "2026-01-11",
    endDate: "2026-01-11",
    entryCount: 1,
    sendCount: 1,
    dayCount: 1,
  },
];

/** A trip whose window is open right now, for the "On now" chip. */
export const currentTrip: TripSummary = {
  id: 4,
  name: "Spring road trip",
  description: "Utah, then Nevada if the heat holds off.",
  startDate: "2026-04-01",
  endDate: "2026-04-30",
  entryCount: 6,
  sendCount: 3,
  dayCount: 4,
};
