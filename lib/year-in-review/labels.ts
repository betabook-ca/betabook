import type { ClimbType } from "@/lib/grades";

/** Lower-case discipline names for running text ("44% bouldering"). */
export const DISCIPLINE_NAMES: Record<ClimbType, string> = {
  boulder: "bouldering",
  sport: "sport",
  trad: "trad",
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** 1 → "January". */
export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
