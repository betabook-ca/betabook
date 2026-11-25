/** The recap is promoted from Dec 1 to Jan 14, in the viewer's local time. */
const WINDOW_END_DAY = 14;

/**
 * The year whose recap the banner and journal card point to on `today` (a
 * civil `YYYY-MM-DD`), or null outside Dec 1 – Jan 14. December points to its
 * own year and early January to the year before.
 *
 * `alwaysOpen` (the `YEAR_REVIEW_ALWAYS_OPEN` Worker variable, for local
 * testing) opens the window every day: January still means last year, and
 * any other month means this one.
 */
export function yearReviewWindow(today: string, alwaysOpen = false): number | null {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  if (!year || !month || !day) return null;
  if (month === 12) return year;
  if (month === 1 && (alwaysOpen || day <= WINDOW_END_DAY)) return year - 1;
  return alwaysOpen ? year : null;
}

/** The years a recap URL may name: from the first plausible logged year to
 * the current one. */
export function parseRecapYear(value: string, currentYear: number): number | null {
  if (!/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= 1950 && year <= currentYear ? year : null;
}
